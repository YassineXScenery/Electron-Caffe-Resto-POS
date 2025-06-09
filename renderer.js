// Add sync button to header
document.querySelector('.header').insertAdjacentHTML('beforeend', `
  <button id="syncButton" class="sync-button" style="margin-right: 10px;">
    <i class="fas fa-sync"></i> Sync Now
  </button>
`);

// Add sync button handler
document.getElementById('syncButton').addEventListener('click', async () => {
  const button = document.getElementById('syncButton');
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
  
  try {
    await window.api.forceSync();
    showNotification('Sync completed successfully', 'success');
    // Refresh the menu after sync
    await loadMenu();
  } catch (err) {
    console.error('Sync failed:', err);
    showNotification('Sync failed: ' + (err.message || "unknown"), 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-sync"></i> Sync Now';
  }
});

/* Insert a new button (and its handler) in the header to force an admin sync */
document.querySelector(".header").insertAdjacentHTML("beforeend", `
  <button id="adminSyncButton" class="sync-button" style="margin-left: 10px; background-color: #f0ad4e;">
    <i class="fas fa-sync"></i> Sync Admins
  </button>
`);

document.getElementById("adminSyncButton").addEventListener("click", async () => {
  const button = document.getElementById("adminSyncButton");
  button.disabled = true;
  button.innerHTML = "<i class=\"fas fa-spinner fa-spin\"></i> Syncing Admins...";
  try {
    const result = await window.api.forceAdminSync();
    if (result) {
      showNotification("Admin sync completed successfully", "success");
    } else {
      showNotification("Admin sync failed (check terminal for details)", "error");
    }
  } catch (err) {
    console.error("Admin sync error:", err);
    showNotification("Admin sync error: " + (err.message || "unknown"), "error");
  } finally {
    button.disabled = false;
    button.innerHTML = "<i class=\"fas fa-sync\"></i> Sync Admins";
  }
}); 