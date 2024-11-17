// const API_KEY = "Jk7MhP2QUzhNgwpGYLgwIiYj3d1AHccl";
const API_KEY = "4xovNgvcMrT64aQncTlySO1rnoG8kFE6";

const LANGUAGE = "en";
const CONNECTION_URL = `wss://eu2.rt.speechmatics.com/v2`; // WebSocket URL without JWT

// const CONNECTION_URL = `wss://wus.rt.speechmatics.com/v2/en`; // WebSocket URL without JWT

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
button.style.background = "#E63946";
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
  activeElement = getActiveElement();
});
button.addEventListener("click", (e) => {
  if (activeElement) {
    activeElement.focus();
    handleToggleRecognition();
  }
});

const getJWTSpeechMatic = async () => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get("token", async (result) => {
      const url = `https://authdev.scribebrain.com/api/v1/utils/speechmatic/token`;
      const headers = new Headers();
      headers.append("Content-Type", "application/json");
      // headers.append("Authorization", `Bearer ${result.token}`);
      headers.append("Authorization", `Bearer ${result.token}`);
      const requestOptions = {
        method: "GET",
        headers: headers,
      };

      try {
        const resp = await fetch(url, requestOptions).then((response) =>
          response.json()
        );

        if (!resp.error) {
          resolve({ token: API_KEY || resp.token, error: "" });
        } else {
          throw new Error(resp.msg);
        }
      } catch (err) {
        resolve({ token: null, error: err.message });
      }
    });
  });
};

const getAthenaDocument = () => {
  const iframe1 = document.getElementById("GlobalWrapper");
  const iframeDocument1 =
    iframe1.contentDocument || iframe1.contentWindow.document;

  const iframe2 = iframeDocument1.getElementById("frameContent");
  const iframeDocument2 =
    iframe2.contentDocument || iframe2.contentWindow.document;

  const iframe3 = iframeDocument2.getElementById("frMain");
  const iframeDocument3 =
    iframe3.contentDocument || iframe3.contentWindow.document;
  return iframeDocument3;
};

const getActiveDocument = () => {
  let el = document.activeElement;

  if (window.location.href.includes("athena")) {
    return getAthenaDocument();
  } else if (el.tagName.toLowerCase() === "iframe") {
    const iframeDocument = el.contentDocument || el.contentWindow.document;
    return iframeDocument;
  }
  return document;
};

const getActiveElement = () => {
  let el = document.activeElement;
  if (window.location.href.includes("athena")) {
    const athenaDocument = getAthenaDocument();
    el = athenaDocument.activeElement;
  } else if (el.tagName.toLowerCase() === "iframe") {
    const iframeDocument = el.contentDocument || el.contentWindow.document;
    el = iframeDocument.activeElement;
  }
  return el;
};

function insertTextAtCursor(text) {
  let el = getActiveElement();
  const tagName = el?.tagName?.toLowerCase();
  const tagNameAndText = tagName && text;
  let fireEvents = false;
  if (tagNameAndText && isEditableField(tagName)) {
    fireEvents = insertTextIntoField(el, text);
  } else if (tagNameAndText && isContentEditableDiv(tagName, el)) {
    fireEvents = insertTextIntoContentEditable(el, text);
  }
  fireEvents && dispatchInputAndChangeEvents(el);
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

  el.value = (value.slice(0, start) + text + value.slice(end)).replace(
    /\.{2,}|\.\s*\./g,
    "."
  );
  el.selectionStart = el.selectionEnd = start + text.length;
  return true;
}

// Check if the element is a contenteditable div
function isContentEditableDiv(tagName, el) {
  return tagName === "div" && el.getAttribute("contenteditable") === "true";
}

const modifyFirstElement = (existingNode) => {
  const zeroWidthChildren = existingNode.querySelectorAll(
    '[data-slate-zero-width="n"]'
  );
  zeroWidthChildren?.forEach((child) => {
    child.removeAttribute("data-slate-zero-width");
    child.removeAttribute("data-slate-length");
    child.setAttribute("data-slate-string", "true");
    child.textContent = "";
  });
};

function debounce(func, delay) {
  let timeoutId; // To hold the timeout ID
  let previousTexts = []; // To store all previous texts

  return function (text) {
    const context = this; // Preserve the context of the original function

    // Clear the previous timeout
    clearTimeout(timeoutId);

    // Push the current text to the previousTexts array
    previousTexts.push(text);

    // Set a new timeout
    timeoutId = setTimeout(() => {
      // Call the original function with all accumulated texts when debounced
      func.call(context, previousTexts.join(""));

      // Clear the previous texts array after sending
      previousTexts = [];
    }, delay);
  };
}

const userSettings = {
  "new line": "\n",
  "new paragraph": "\n\n",
  dot: ".",
  comma: ",",
  "semi colon": ";",
  semicolon: ";",
  colon: ":",
  "question mark": "?",
  "exclamation mark": "!",
  hyphen: "-",
  slash: "/",
  "percent sign": "%",
  "and sign": "&",
  "left parenthesis": "(",
  "right parenthesis": ")",
  "left bracket": "[",
  "right bracket": "]",
  "left brace": "{",
  "right brace": "}",
  "plus sign": "+",
  "minus sign": "-",
  "equals sign": "=",
  asterisk: "*",

  // Medical terminology
  "patient name": "[Patient's Name]",
  "blood pressure": "BP",
  "heart rate": "HR",
  "oxygen saturation": "SpO2",
  temperature: "Temp",
  "white blood cell count": "WBC",
  "red blood cell count": "RBC",
  hematocrit: "Hct",
  hemoglobin: "Hb",
  "physical examination": "PE",
  "review of systems": "ROS",
  "chief complaint": "CC",
  "history of present illness": "HPI",
  "family history": "FHx",
  "social history": "SHx",
  "past medical history": "PMHx",
  "past surgical history": "PSHx",
  diagnosis: "Dx",
  treatment: "Tx",
  prescription: "Rx",
  symptoms: "sx",
  diagnostics: "Dx tests",

  // Medical abbreviations for common tests
  electrocardiogram: "ECG",
  echocardiogram: "echo",
  "chest X-ray": "CXR",

  // Drug administration instructions
  "once daily": "QD",
  "twice daily": "BID",
  "three times daily": "TID",
  // Add more mappings as needed
};

function transformTranscript(transcript) {
  let transformedText = transcript;

  Object.entries(userSettings).forEach(([keyword, replacement]) => {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    transformedText = transformedText.replace(regex, replacement);
  });

  return transformedText;
}

function insertTextIntoContentEditable(el, text) {
  const activeDocument = getActiveDocument();
  const selection = activeDocument.getSelection();

  if (selection.rangeCount > 0) {
    if (el.getAttribute("data-slate-editor")) {
      modifyFirstElement(el);
    }

    const range = selection.getRangeAt(0);
    if (el.getAttribute("data-slate-editor")) {
      const container = range.startContainer;
      const originalText = container.textContent;
      const beforeCursor = originalText.slice(0, range.startOffset);
      const afterCursor = originalText.slice(range.startOffset);
      const startWithDot = text.trim()[0] === ".";
      const dotOnAWrongPlace =
        text.trim() === "." &&
        (originalText.trim().length < 2 || originalText.trim().endsWith("."));
      const clearedText = startWithDot ? text.replace(".", "") : text;
      const modifiedBeforeCursorText =
        !beforeCursor.endsWith(" ") &&
        clearedText[0] !== " " &&
        clearedText[0].trim() !== "."
          ? `${beforeCursor} `
          : beforeCursor;
      const newText = modifiedBeforeCursorText + clearedText + afterCursor;
      if (
        !clearedText.trim() &&
        (beforeCursor.trim().endsWith("\n") || !beforeCursor.trim())
      ) {
        return;
      }
      // console.log({
      //   originalText: originalText,
      //   checks: {
      //     startWithDot: startWithDot,
      //     lengthLower: originalText.trim().length < 2,
      //     endsWithDot: originalText.trim().endsWith("."),
      //   },
      //   clearedText: clearedText,
      //   newText: newText,
      //   finalText: newText.replace(/\.{2,}|\.\s*\./g, "."),
      // });

      if (dotOnAWrongPlace && !startWithDot) {
        return;
      }

      if (newText) {
        container.textContent = newText.replace(/\.{2,}|\.\s*\./g, ".");
        return true;
      }
    } else {
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
  } else {
    console.log("No valid text selection found");
  }
  return false;
}

function dispatchInputAndChangeEvents(el) {
  const inputEvent = new Event("input", { bubbles: true, cancelable: true });
  el.dispatchEvent(inputEvent);
  const changeEvent = new Event("change", { bubbles: true, cancelable: true });
  el.dispatchEvent(changeEvent);
}

const fireLogoutEvent = () => {
  chrome.runtime.sendMessage(
    {
      type: "LogoutUser",
      data: { message: "Session is expired!" },
    },
    (response) => {
      if (response?.status === "Ok") {
        showHideNotification();
        button.style.display = "none";
      }
    }
  );
};

const handleToggleRecognition = () => {
  try {
    chrome.storage.local.get("token", async function (result) {
      const jwtToken = await getJwt();
      if (!result?.token || !jwtToken) {
        button.style.display = "none";
        showHideNotification();
        fireLogoutEvent();
        return;
      }
      toggleRecognition(jwtToken);
    });
  } catch (error) {
    console.error("Error toggling recognition:", error);
  }
};

chrome.runtime.onMessage.addListener((request) => {
  if (request.command === "toggleRecognition") {
    try {
      handleToggleRecognition();
    } catch (err) {
      console.error(err, "Check, getting token from storage.");
    }
  }
});

const notification = document.createElement("div");
notification.id = "sessionExpiredNotification";
notification.innerHTML = `
  <strong>🔴 Scribebrain Speech-to-Text</strong><br>
  Session expired. Please log in again.<br>
  <span style="font-size: 12px; color: #721C24;">
    Click the Scribebrain extension icon in your browser toolbar to log back in.
  </span>
`;
notification.style.position = "fixed";
notification.style.bottom = "20px";
notification.style.right = "20px";
notification.style.zIndex = "10000";
notification.style.background = "#F8D7DA"; // Light red background
notification.style.color = "#721C24"; // Dark red text
notification.style.border = "1px solid #F5C6CB"; // Border to match theme
notification.style.borderRadius = "8px";
notification.style.padding = "15px 25px";
notification.style.fontSize = "14px";
notification.style.boxShadow = "0px 4px 6px rgba(0, 0, 0, 0.1)";
notification.style.fontFamily = "'Arial', sans-serif";
notification.style.lineHeight = "1.5"; // Adjust line spacing for better readability
notification.style.display = "none"; // Initially hidden
document.body.appendChild(notification);

function showSessionExpiredNotification() {
  notification.style.display = "block";
}

function hideSessionExpiredNotification() {
  notification.style.display = "none";
}

const showHideNotification = () => {
  showSessionExpiredNotification();
  const timeout = setTimeout(() => {
    hideSessionExpiredNotification();
    clearTimeout(timeout);
  }, 5000);
};

async function getJwt() {
  try {
    const API_KEY = await getJWTSpeechMatic();
    if (API_KEY.error) {
      console.error("Please check API_KEY endpoints !");
      fireLogoutEvent();
      return;
    }
    const response = await fetch(
      `https://mp.speechmatics.com/v1/api_keys?type=rt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY.token}`,
        },
        body: JSON.stringify({ ttl: 3600 }),
      }
    );
    const data = await response.json();
    button.style.display = "block";
    return data.key_value;
  } catch (error) {
    console.error("Error fetching JWT:", error);
    throw error;
  }
}

function toggleRecognition(jwtToken) {
  if (isTranscribing) {
    stopTranscription();
  } else {
    button.style.opacity = "0.5";
    startTranscription(jwtToken);
  }
}

const setupAudioProcessing = () => {
  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    isTranscribing = true;
    if (socket && socket.readyState === WebSocket.OPEN) {
      const buffer = new ArrayBuffer(inputData.length * 4);
      const view = new DataView(buffer);
      for (let i = 0; i < inputData.length; i++) {
        view.setFloat32(i * 4, inputData[i], true); // true for little-endian
      }
      socket.send(buffer);
    }
  };
};

async function startTranscription(jwtToken) {
  try {
    await initializeAudioContext();
    await setupWebSocket(jwtToken);
    setupAudioProcessing();
  } catch (err) {
    console.error("Error starting transcription:", err);
    stopTranscription(); // Ensure proper cleanup
  }
}

function textToNumberSentence(text) {
  const units = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
  };

  const teens = {
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
  };

  const tens = {
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };

  const hundreds = {
    hundred: 100,
  };

  function convertTextToNumber(textNum) {
    let result = 0;
    let current = 0;
    const words = textNum.toLowerCase().split(/[\s-]+/);

    words.forEach((word) => {
      if (units[word] !== undefined) {
        current += units[word];
      } else if (teens[word] !== undefined) {
        current += teens[word];
      } else if (tens[word] !== undefined) {
        current += tens[word];
      } else if (hundreds[word] !== undefined) {
        current *= hundreds[word];
      }
    });

    return result + current;
  }

  return text.replace(
    /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[\s-]+(?:one|two|three|four|five|six|seven|eight|nine))?\b/gi,
    (match) => convertTextToNumber(match)
  );
}

function formatSpeechToText(input) {
  const newText = textToNumberSentence(input);
  const result = newText.replace(/Number (\d+),?/gi, (match, num) => `${num}.`);
  return result;
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

const debouncedSendTexts = debounce(insertTextAtCursor, 500);

async function setupWebSocket(jwtToken) {
  socket = new WebSocket(`${CONNECTION_URL}?jwt=${jwtToken}`);
  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    console.log("WebSocket connection opened");
    button.style.background = "#28A745";
    button.style.opacity = "1";
    sendConfigMessage();
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.message === "AddTranscript") {
      let transcript = message.metadata.transcript;
      transcript = transcript.trimStart();
      transcript = transcript.replace(/\s+([.,!?;:])/g, "$1");
      transcript = transcript.trimEnd();
      transcript = transcript.replace(/([.!?;:])\s*$/, "$1 ");

      if (transcript.trim()) {
        debouncedSendTexts(formatSpeechToText(transformTranscript(transcript)));
      }
    }
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
    button.style.background = "#E63946";
  };

  socket.onclose = () => {
    console.log("WebSocket connection closed");
    button.style.background = "#E63946";
  };
}

function sendConfigMessage() {
  const configMessage = {
    message: "StartRecognition",
    transcription_config: {
      language: LANGUAGE,
      enable_partials: true,
      max_delay: 16,
      max_delay_mode: "fixed",
    },
    audio_format: {
      type: "raw",
      encoding: "pcm_f32le",
      sample_rate: audioContext.sampleRate,
    },
  };
  socket.send(JSON.stringify(configMessage));
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
  if (audioContext && audioContext.state !== "closed") {
    audioContext.close();
  }
  lastPartialLength = 0;
}
