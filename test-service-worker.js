// Minimal test service worker
console.log("Test service worker loaded");

// Test basic functionality
chrome.runtime.onInstalled.addListener(() => {
  console.log("Test extension installed");
});

chrome.runtime.onStartup.addListener(() => {
  console.log("Test extension started");
});

// Test WebSocket connection
try {
  const ws = new WebSocket("ws://localhost:8777");

  ws.onopen = () => {
    console.log("WebSocket connected successfully");
    ws.close();
  };

  ws.onerror = (error) => {
    console.log("WebSocket connection failed:", error);
  };

  ws.onclose = () => {
    console.log("WebSocket connection closed");
  };
} catch (error) {
  console.error("Failed to create WebSocket:", error);
}
