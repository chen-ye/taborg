export default defineBackground(async () => {
  console.log('Tab Vibes background script loaded');

  // Allows users to open the side panel by clicking on the action toolbar icon
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error(error);
  }
});
