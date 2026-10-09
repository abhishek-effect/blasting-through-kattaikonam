/**
 * ArmsViewmodel Module
 * Constructs first-person arms and hands holding weapons and items.
 * Renders stylized sleeves, cuffs, and hands gripping the weapon
 * so firearms and items no longer look like they are floating in the air.
 */
import * as THREE from 'three';

// Shared materials for uniform sleeve and skin
const sleeveMaterial = new THREE.MeshBasicMaterial({
  color: 0x1e293b, // Navy blue uniform fabric
  depthTest: false,
  depthWrite: false,
});

const cuffMaterial = new THREE.MeshBasicMaterial({
  color: 0x0f172a, // Darker sleeve cuff trim
  depthTest: false,
  depthWrite: false,
});

const watchStrapMaterial = new THREE.MeshBasicMaterial({
  color: 0x18181b, // Black watch strap
  depthTest: false,
  depthWrite: false,
});

const watchBezelMaterial = new THREE.MeshBasicMaterial({
  color: 0xa1a1aa, // Metallic digital watch face
  depthTest: false,
  depthWrite: false,
});

const skinMaterial = new THREE.MeshBasicMaterial({
  color: 0xb57c55, // Warm skin tone
  depthTest: false,
  depthWrite: false,
});

const skinDarkMaterial = new THREE.MeshBasicMaterial({
  color: 0x935d3d, // Shaded underside of hand/fingers
  depthTest: false,
  depthWrite: false,
});

/**
 * Helper to build a cylinder between two 3D points
 */
function createLimbSegment(pStart, pEnd, radiusStart, radiusEnd, material, renderOrder = 997, segments = 8) {
  const dir = new THREE.Vector3().subVectors(pEnd, pStart);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(pStart, pEnd).multiplyScalar(0.5);

  const geo = new THREE.CylinderGeometry(radiusEnd, radiusStart, len, segments);
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = renderOrder;
  mesh.position.copy(mid);

  const up = new THREE.Vector3(0, 1, 0);
  if (len > 0.0001) {
    mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
  }
  return mesh;
}

/**
 * Creates right arm gripping the rifle pistol grip and left arm supporting the handguard
 */
export function createRifleArms() {
  const group = new THREE.Group();

  // ==========================================
  // 1. RIGHT ARM (Firing / Trigger Hand)
  // Grip is at roughly x = 0.055, y = -0.07, z = 0.0
  // ==========================================
  const rightElbow = new THREE.Vector3(0.20, -0.32, 0.22);
  const rightWrist = new THREE.Vector3(0.08, -0.12, 0.04);

  // Forearm sleeve
  const rightForearm = createLimbSegment(rightElbow, rightWrist, 0.046, 0.038, sleeveMaterial, 996);
  group.add(rightForearm);

  // Sleeve cuff ring
  const rightCuff = createLimbSegment(
    new THREE.Vector3().lerpVectors(rightElbow, rightWrist, 0.90),
    rightWrist,
    0.040,
    0.041,
    cuffMaterial,
    996
  );
  group.add(rightCuff);

  // Bare wrist
  const rightHandPos = new THREE.Vector3(0.058, -0.072, 0.015);
  const rightWristSkin = createLimbSegment(rightWrist, rightHandPos, 0.034, 0.032, skinMaterial, 997);
  group.add(rightWristSkin);

  // Palm (behind the grip)
  const palmGeo = new THREE.BoxGeometry(0.045, 0.055, 0.032);
  const palmMesh = new THREE.Mesh(palmGeo, skinMaterial);
  palmMesh.renderOrder = 997; // Behind gun (gun is 998)
  palmMesh.position.set(0.065, -0.072, 0.012);
  palmMesh.rotation.set(0.1, -0.2, 0.15);
  group.add(palmMesh);

  // Fingers wrapping around FRONT of pistol grip (renderOrder 999 to wrap over gun)
  // Index finger extending to trigger guard
  const triggerFinger = createLimbSegment(
    new THREE.Vector3(0.060, -0.052, 0.015),
    new THREE.Vector3(0.015, -0.048, 0.008),
    0.009,
    0.007,
    skinMaterial,
    999
  );
  group.add(triggerFinger);

  // Middle finger wrapped around front of grip
  const middleFinger = createLimbSegment(
    new THREE.Vector3(0.060, -0.068, 0.018),
    new THREE.Vector3(0.038, -0.070, -0.008),
    0.010,
    0.008,
    skinMaterial,
    999
  );
  group.add(middleFinger);

  // Ring finger wrapped around front of grip
  const ringFinger = createLimbSegment(
    new THREE.Vector3(0.062, -0.084, 0.018),
    new THREE.Vector3(0.042, -0.086, -0.008),
    0.009,
    0.008,
    skinMaterial,
    999
  );
  group.add(ringFinger);

  // Pinky finger wrapped around front of grip
  const pinkyFinger = createLimbSegment(
    new THREE.Vector3(0.064, -0.100, 0.016),
    new THREE.Vector3(0.046, -0.102, -0.006),
    0.008,
    0.007,
    skinMaterial,
    999
  );
  group.add(pinkyFinger);

  // Thumb resting on the upper side of the grip
  const rightThumb = createLimbSegment(
    new THREE.Vector3(0.068, -0.055, 0.020),
    new THREE.Vector3(0.045, -0.045, 0.012),
    0.011,
    0.009,
    skinMaterial,
    999
  );
  group.add(rightThumb);

  // ==========================================
  // 2. LEFT ARM (Supporting handguard)
  // Handguard is at roughly x = -0.08, y = -0.04, z = 0.0
  // ==========================================
  const leftElbow = new THREE.Vector3(-0.16, -0.34, 0.18);
  const leftWrist = new THREE.Vector3(-0.085, -0.095, 0.03);

  // Forearm sleeve
  const leftForearm = createLimbSegment(leftElbow, leftWrist, 0.046, 0.038, sleeveMaterial, 996);
  group.add(leftForearm);

  // Sleeve cuff ring
  const leftCuff = createLimbSegment(
    new THREE.Vector3().lerpVectors(leftElbow, leftWrist, 0.88),
    leftWrist,
    0.040,
    0.041,
    cuffMaterial,
    996
  );
  group.add(leftCuff);

  // Wrist watch
  const watchPos = new THREE.Vector3().lerpVectors(leftElbow, leftWrist, 0.94);
  const watchStrap = createLimbSegment(watchPos, leftWrist, 0.038, 0.038, watchStrapMaterial, 996);
  group.add(watchStrap);

  const watchBezelGeo = new THREE.BoxGeometry(0.014, 0.016, 0.006);
  const watchBezel = new THREE.Mesh(watchBezelGeo, watchBezelMaterial);
  watchBezel.position.set(leftWrist.x - 0.015, leftWrist.y + 0.005, leftWrist.z + 0.02);
  watchBezel.renderOrder = 997;
  group.add(watchBezel);

  // Palm cupping underneath the wooden handguard
  const leftHandPos = new THREE.Vector3(-0.075, -0.055, 0.005);
  const leftPalmGeo = new THREE.BoxGeometry(0.048, 0.025, 0.038);
  const leftPalmMesh = new THREE.Mesh(leftPalmGeo, skinMaterial);
  leftPalmMesh.renderOrder = 997;
  leftPalmMesh.position.copy(leftHandPos);
  leftPalmMesh.rotation.set(0.15, 0.1, -0.2);
  group.add(leftPalmMesh);

  // Left fingers curling up on the far side of the handguard
  const leftFingers = createLimbSegment(
    new THREE.Vector3(-0.080, -0.060, -0.012),
    new THREE.Vector3(-0.075, -0.032, -0.014),
    0.018,
    0.016,
    skinDarkMaterial,
    997
  );
  group.add(leftFingers);

  // Left thumb resting on top/near side of handguard (wraps over gun -> 999)
  const leftThumb = createLimbSegment(
    new THREE.Vector3(-0.065, -0.055, 0.018),
    new THREE.Vector3(-0.070, -0.028, 0.012),
    0.010,
    0.008,
    skinMaterial,
    999
  );
  group.add(leftThumb);

  return group;
}

/**
 * Creates two-handed combat stance arms holding the pistol
 */
export function createPistolArms() {
  const group = new THREE.Group();

  // ==========================================
  // 1. RIGHT ARM (Main Pistol Grip)
  // Grip is at roughly x = 0.055, y = -0.07, z = 0.0
  // ==========================================
  const rightElbow = new THREE.Vector3(0.18, -0.32, 0.22);
  const rightWrist = new THREE.Vector3(0.075, -0.12, 0.04);

  // Forearm sleeve
  const rightForearm = createLimbSegment(rightElbow, rightWrist, 0.045, 0.037, sleeveMaterial, 996);
  group.add(rightForearm);

  // Sleeve cuff
  const rightCuff = createLimbSegment(
    new THREE.Vector3().lerpVectors(rightElbow, rightWrist, 0.88),
    rightWrist,
    0.039,
    0.040,
    cuffMaterial,
    996
  );
  group.add(rightCuff);

  // Right Palm
  const rightPalmGeo = new THREE.BoxGeometry(0.042, 0.052, 0.030);
  const rightPalmMesh = new THREE.Mesh(rightPalmGeo, skinMaterial);
  rightPalmMesh.renderOrder = 997;
  rightPalmMesh.position.set(0.062, -0.070, 0.010);
  rightPalmMesh.rotation.set(0.08, -0.15, 0.12);
  group.add(rightPalmMesh);

  // Trigger finger
  const triggerFinger = createLimbSegment(
    new THREE.Vector3(0.055, -0.048, 0.012),
    new THREE.Vector3(0.018, -0.044, 0.006),
    0.008,
    0.007,
    skinMaterial,
    999
  );
  group.add(triggerFinger);

  // Gripping fingers wrapped over front of pistol handle
  const middleFinger = createLimbSegment(
    new THREE.Vector3(0.056, -0.064, 0.016),
    new THREE.Vector3(0.036, -0.066, -0.008),
    0.009,
    0.008,
    skinMaterial,
    999
  );
  group.add(middleFinger);

  const ringFinger = createLimbSegment(
    new THREE.Vector3(0.058, -0.080, 0.016),
    new THREE.Vector3(0.038, -0.082, -0.008),
    0.009,
    0.008,
    skinMaterial,
    999
  );
  group.add(ringFinger);

  const pinkyFinger = createLimbSegment(
    new THREE.Vector3(0.060, -0.096, 0.015),
    new THREE.Vector3(0.042, -0.098, -0.006),
    0.008,
    0.007,
    skinMaterial,
    999
  );
  group.add(pinkyFinger);

  // Right thumb resting along upper frame
  const rightThumb = createLimbSegment(
    new THREE.Vector3(0.064, -0.050, 0.018),
    new THREE.Vector3(0.038, -0.040, 0.012),
    0.010,
    0.008,
    skinMaterial,
    999
  );
  group.add(rightThumb);

  // ==========================================
  // 2. LEFT ARM (Supporting Two-Handed Stance)
  // Cups under and around the right hand and grip base
  // ==========================================
  const leftElbow = new THREE.Vector3(-0.10, -0.34, 0.20);
  const leftWrist = new THREE.Vector3(0.030, -0.13, 0.05);

  const leftForearm = createLimbSegment(leftElbow, leftWrist, 0.045, 0.037, sleeveMaterial, 996);
  group.add(leftForearm);

  const leftCuff = createLimbSegment(
    new THREE.Vector3().lerpVectors(leftElbow, leftWrist, 0.88),
    leftWrist,
    0.039,
    0.040,
    cuffMaterial,
    996
  );
  group.add(leftCuff);

  // Left palm cupping bottom of grip and right hand
  const leftPalmGeo = new THREE.BoxGeometry(0.040, 0.048, 0.032);
  const leftPalmMesh = new THREE.Mesh(leftPalmGeo, skinMaterial);
  leftPalmMesh.renderOrder = 997;
  leftPalmMesh.position.set(0.045, -0.095, 0.022);
  leftPalmMesh.rotation.set(0.2, 0.15, -0.1);
  group.add(leftPalmMesh);

  // Left fingers cupping over the front of the right fingers
  const leftSupportFingers = createLimbSegment(
    new THREE.Vector3(0.050, -0.088, 0.025),
    new THREE.Vector3(0.030, -0.076, 0.012),
    0.014,
    0.012,
    skinMaterial,
    999
  );
  group.add(leftSupportFingers);

  // Left thumb resting forward along frame
  const leftThumb = createLimbSegment(
    new THREE.Vector3(0.042, -0.065, 0.025),
    new THREE.Vector3(0.015, -0.045, 0.018),
    0.010,
    0.008,
    skinMaterial,
    999
  );
  group.add(leftThumb);

  return group;
}

/**
 * Creates hands holding medkit from both sides
 */
export function createMedkitArms() {
  const group = new THREE.Group();

  // Right arm holding right side
  const rElbow = new THREE.Vector3(0.18, -0.28, 0.16);
  const rWrist = new THREE.Vector3(0.13, -0.06, 0.03);
  group.add(createLimbSegment(rElbow, rWrist, 0.042, 0.035, sleeveMaterial, 996));

  const rHand = createLimbSegment(
    rWrist,
    new THREE.Vector3(0.11, -0.02, 0.01),
    0.028,
    0.024,
    skinMaterial,
    999
  );
  group.add(rHand);

  // Left arm holding left side
  const lElbow = new THREE.Vector3(-0.18, -0.28, 0.16);
  const lWrist = new THREE.Vector3(-0.13, -0.06, 0.03);
  group.add(createLimbSegment(lElbow, lWrist, 0.042, 0.035, sleeveMaterial, 996));

  const lHand = createLimbSegment(
    lWrist,
    new THREE.Vector3(-0.11, -0.02, 0.01),
    0.028,
    0.024,
    skinMaterial,
    999
  );
  group.add(lHand);

  return group;
}

