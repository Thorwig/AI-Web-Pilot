// Simple test script to verify extension loading
console.log("Extension test script loaded");

// Test basic Chrome APIs
if (typeof chrome !== "undefined") {
  console.log("Chrome APIs available");

  // Test tabs API
  if (chrome.tabs) {
    console.log("Tabs API available");
  }

  // Test debugger API
  if (chrome.debugger) {
    console.log("Debugger API available");
  }

  // Test runtime API
  if (chrome.runtime) {
    console.log("Runtime API available");
  }
} else {
  console.error("Chrome APIs not available");
}
