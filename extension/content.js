const API_KEY = "4xovNgvcMrT64aQncTlySO1rnoG8kFE6";
const LANGUAGE = "en";
const CONNECTION_URL = `wss://eu2.rt.speechmatics.com/v2`; // WebSocket URL without JWT

let isTranscribing = false;
let audioContext;
let mediaStream;
let socket;
let processor;
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
  let el = document.activeElement;

  if (el.tagName.toLowerCase() === "iframe") {
    const iframeDocument = el.contentDocument || el.contentWindow.document;
    el = iframeDocument.activeElement;
  }

  const tagName = el?.tagName?.toLowerCase();

  if (tagName && isEditableField(tagName)) {
    insertTextIntoField(el, text);
  } else if (tagName && isContentEditableDiv(tagName, el)) {
    insertTextIntoContentEditable(el, text);
  }

  dispatchInputAndChangeEvents(el);
}

// Check if the element is an input or textarea
function isEditableField(tagName) {
  return tagName === "input" || tagName === "textarea";
}

// Insert text into input or textarea
function insertTextIntoField(el, text) {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const value = el.value;

  el.value = value.slice(0, start) + text + value.slice(end);
  el.selectionStart = el.selectionEnd = start + text.length;
}

// Check if the element is a contenteditable div
function isContentEditableDiv(tagName, el) {
  return tagName === "div" && el.getAttribute("contenteditable") === "true";
}

// Insert text into contenteditable div
function insertTextIntoContentEditable(el, text) {
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

// Dispatch input and change events
function dispatchInputAndChangeEvents(el) {
  const inputEvent = new Event("input", { bubbles: true, cancelable: true });
  el.dispatchEvent(inputEvent);

  const changeEvent = new Event("change", { bubbles: true, cancelable: true });
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
    await initializeAudioContext();
    await setupWebSocket();
    setupAudioProcessing();
  } catch (err) {
    console.error("Error starting transcription:", err);
    stopTranscription(); // Ensure proper cleanup
  }
}

async function initializeAudioContext() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  mediaStream = stream;
  const source = audioContext.createMediaStreamSource(stream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);

  source.connect(processor);
  processor.connect(audioContext.destination);
}

async function setupWebSocket() {
  const token = await getJwt();
  socket = new WebSocket(`${CONNECTION_URL}?jwt=${token}`);
  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    console.log("WebSocket connection opened");
    sendConfigMessage();
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.message === "AddTranscript") {
      const transcript = message.metadata.transcript;
      insertTextAtCursor(transcript);
    }
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  socket.onclose = () => {
    console.log("WebSocket connection closed");
  };
}

function sendConfigMessage() {
  const configMessage = {
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
}

function setupAudioProcessing() {
  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    if (socket && socket.readyState === WebSocket.OPEN) {
      const buffer = new ArrayBuffer(inputData.length * 4);
      const view = new DataView(buffer);
      for (let i = 0; i < inputData.length; i++) {
        view.setFloat32(i * 4, inputData[i], true); // true for little-endian
      }
      socket.send(buffer);
    }
  };
}

function stopTranscription() {
  isTranscribing = false;

  if (processor) {
    processor.disconnect();
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }
  if (socket) {
    socket.close();
  }
  if (audioContext) {
    audioContext.close();
  }
  lastPartialLength = 0;
}
