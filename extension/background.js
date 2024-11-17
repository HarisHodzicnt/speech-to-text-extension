async function toggleSpeechToText() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  chrome.tabs.sendMessage(activeTab.id, { command: "toggleRecognition" });
  chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle_speech_to_text") {
    toggleSpeechToText();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LogoutUser") {
    chrome.storage.local.remove("token", () => {
      sendResponse({ status: "Ok" });
    });

    return true;
  }
});
