let isTranscribing = false;
let audioContext;
let mediaStream;
let socket;
let processor;
const API_KEY = "4xovNgvcMrT64aQncTlySO1rnoG8kFE6";
const LANGUAGE = "en";
const CONNECTION_URL = `wss://eu2.rt.speechmatics.com/v2`; // WebSocket URL without JWT
let lastPartialLength = 0;

const button = document.createElement("button");
button.id = "speechToTextButton";
button.textContent = "🎙️";
button.style.position = "fixed";
button.style.bottom = "20px";
button.style.right = "20px";
button.style.zIndex = "10000";
button.style.background = "#000";
button.style.color = "#fff";
button.style.border = "none";
button.style.borderRadius = "50%";
button.style.width = "50px";
button.style.height = "50px";
button.style.fontSize = "24px";
button.style.cursor = "pointer";
button.style.display = "none";
document.body.appendChild(button);

let activeElement;
button.addEventListener("mousedown", (event) => {
  activeElement = document.activeElement;
});
button.addEventListener("click", (e) => {
  if (activeElement) activeElement.focus();
  toggleRecognition();
});

function insertTextAtCursor(text) {
  const el = document.activeElement;
  const tagName = el.tagName.toLowerCase();

  if (tagName === "input" || tagName === "textarea") {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = el.value;

    el.value = value.slice(0, start) + text + value.slice(end);
    el.selectionStart = el.selectionEnd = start + text.length;
  } else if (
    tagName === "div" &&
    el.getAttribute("contenteditable") === "true"
  ) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);

    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  const inputEvent = new Event("input", { bubbles: true, cancelable: true });
  el.dispatchEvent(inputEvent);
  const changeEvent = new Event("change", {
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(changeEvent);
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.command === "toggleRecognition") {
    toggleRecognition();
  }
});

async function getJwt() {
  try {
    const response = await fetch(
      `https://mp.speechmatics.com/v1/api_keys?type=rt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ ttl: 3600 }),
      }
    );
    const data = await response.json();
    return data.key_value;
  } catch (error) {
    console.error("Error fetching JWT:", error);
    throw error;
  }
}

function toggleRecognition() {
  if (isTranscribing) {
    stopTranscription();
    button.style.background = "#000";
  } else {
    startTranscription();
    button.style.background = "#f00";
  }
}

async function startTranscription() {
  isTranscribing = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    mediaStream = stream;
    var source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(audioContext.destination);

    const token = await getJwt();
    socket = new WebSocket(`${CONNECTION_URL}?jwt=${token}`);
    socket.binaryType = "arraybuffer"; // Keep binaryType as 'arraybuffer'

    socket.onopen = function () {
      console.log("WebSocket connection opened");

      var configMessage = {
        message: "StartRecognition",
        transcription_config: {
          language: LANGUAGE,
          enable_partials: true,
          max_delay: 3,
        },
        audio_format: {
          type: "raw",
          encoding: "pcm_f32le",
          sample_rate: audioContext.sampleRate,
        },
      };
      socket.send(JSON.stringify(configMessage));
    };

    lastPartial = "";
    socket.onmessage = function (event) {
      var message = JSON.parse(event.data);
      // if (message.message === "AddPartialTranscript") {
      //   var transcript = message.metadata.transcript;
      //   if (transcript && lastPartial.trim() !== transcript.trim()) {
      //     console.log(transcript, lastPartial);
      //     lastPartial = transcript;
      //     insertTextAtCursor(transcript);
      //   }
      // }
      //else
      if (message.message === "AddTranscript") {
        var transcript = message.metadata.transcript;
        insertTextAtCursor(transcript);
      }
      // else {
      //   console.log("Received message:", message);
      // }
    };

    socket.onerror = function (error) {
      console.error("WebSocket error:", error);
    };

    socket.onclose = function () {
      console.log("WebSocket connection closed");
    };

    processor.onaudioprocess = function (e) {
      var inputData = e.inputBuffer.getChannelData(0);
      if (socket && socket.readyState === WebSocket.OPEN) {
        var buffer = new ArrayBuffer(inputData.length * 4);
        var view = new DataView(buffer);
        for (var i = 0; i < inputData.length; i++) {
          view.setFloat32(i * 4, inputData[i], true); // true for little-endian
        }
        socket.send(buffer);
      }
    };
  } catch (err) {
    console.error("Error starting transcription:", err);
    isTranscribing = false;
  }
}

function stopTranscription() {
  isTranscribing = false;

  if (processor) {
    processor.disconnect();
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(function (track) {
      track.stop();
    });
  }
  if (socket) {
    socket.close();
  }
  if (audioContext) {
    audioContext.close();
  }
  lastPartialLength = 0;
}
