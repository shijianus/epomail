export const cameraState = {
  vz: 1, // 1 = normal forward velocity. < 1 means slowed or knocked backward
  panX: 0,
  panY: 0,
  panVelX: 0,
  panVelY: 0,
  shakeX: 0,
  shakeY: 0,
  shakeIntensity: 0,
  overlayOpacity: 0,
  overlayColor: "rgba(255,255,255,1)",
};

export function updateCameraPhysics(dt: number) {
  // Z-velocity recovery (spring back to 1)
  cameraState.vz += (1 - cameraState.vz) * dt * 1.5;

  // Pan recovery (spring back to center)
  cameraState.panX += cameraState.panVelX * dt;
  cameraState.panY += cameraState.panVelY * dt;
  cameraState.panVelX *= Math.pow(0.85, dt * 60); // friction
  cameraState.panVelY *= Math.pow(0.85, dt * 60);
  cameraState.panX += (0 - cameraState.panX) * dt * 3;
  cameraState.panY += (0 - cameraState.panY) * dt * 3;

  // Shake
  if (cameraState.shakeIntensity > 0) {
    cameraState.shakeIntensity -= dt * 100; // Faster decay for sharper impact
    if (cameraState.shakeIntensity < 0) cameraState.shakeIntensity = 0;
    
    // Use chaotic random shake for maximum visceral impact
    cameraState.shakeX = (Math.random() - 0.5) * 2 * cameraState.shakeIntensity;
    cameraState.shakeY = (Math.random() - 0.5) * 2 * cameraState.shakeIntensity;
  } else {
    cameraState.shakeX = 0;
    cameraState.shakeY = 0;
  }

  // Overlay fade
  if (cameraState.overlayOpacity > 0) {
    cameraState.overlayOpacity -= dt * 0.8;
    if (cameraState.overlayOpacity < 0) cameraState.overlayOpacity = 0;
  }
}
