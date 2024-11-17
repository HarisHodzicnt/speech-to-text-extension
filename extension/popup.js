const login = async (username, password) => {
  const url = `https://authdev.scribebrain.com/api/v1/user/sign/in`;
  const postData = {
    username,
    password,
  };
  const headers = new Headers();
  headers.append("Content-Type", "application/json");
  const requestOptions = {
    method: "POST",
    headers: headers,
    body: JSON.stringify(postData),
  };
  const resp = await fetch(url, requestOptions).then((response) =>
    response.json()
  );
  try {
    if (!resp.error) {
      return { token: resp.tokens.access, error: "" };
    } else throw resp.msg;
  } catch (msg) {
    const errorMessage =
      typeof msg === "string" &&
      (msg.includes("wrong user") ||
        msg.includes("user with the given email") ||
        msg.includes("user with the given username"))
        ? String(msg).charAt(0).toUpperCase() + String(msg).slice(1)
        : `Oops! It seems something went wrong. We apologize for the inconvenience caused.  
              Please contact our customer support team for assistance. 
              We value your feedback and are here to assist.`;
    return {
      token: null,
      error: errorMessage,
    };
  }
};

document.addEventListener("DOMContentLoaded", function () {
  chrome.storage.local.get("token", function (result) {
    if (result?.token) {
      showMainContent();
    }
  });
});

const setTokenInChromeStorage = (token) => {
  chrome.storage.local.set({ token: token });
};

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const loginResp = await login(username, password);
  if (loginResp.error) {
    setTokenInChromeStorage("");
    document.getElementById("error-message").textContent = loginResp.error;
    const timeout = setTimeout(() => {
      document.getElementById("error-message").textContent = "";
      clearTimeout(timeout);
    }, 5000);
  } else {
    document.getElementById("error-message").textContent = "";
    setTokenInChromeStorage(loginResp.token);
    username.value = "";
    password.value = "";
    showMainContent();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LogoutUserFromPopUp") {
    removeMainContent();
    logout();
    sendResponse({ status: "Ok" });
  }
});

document.getElementById("logout-button").addEventListener("click", function () {
  logout();
});

function logout() {
  setTokenInChromeStorage("");
  location.reload();
}

function showMainContent() {
  document.getElementById("login-form").classList.add("hidden");
  document.getElementById("form-header").classList.add("hidden");
  document.getElementById("form-title-sign-in").classList.add("hidden");
  document.getElementById("main-content").classList.remove("hidden");
}

function removeMainContent() {
  document.getElementById("login-form").classList.remove("hidden");
  document.getElementById("form-header").classList.remove("hidden");
  document.getElementById("form-title-sign-in").classList.remove("hidden");
  document.getElementById("main-content").classList.remove("hidden");
}
