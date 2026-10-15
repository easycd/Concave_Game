const PIXELS_PER_METER=42.5, MAP_METERS_WIDTH=104, MAP_METERS_HEIGHT=96;
export const CONFIG = Object.freeze({
  pixelsPerMeter: PIXELS_PER_METER, mapMetersWidth: MAP_METERS_WIDTH, mapMetersHeight: MAP_METERS_HEIGHT,
  mapWidth: MAP_METERS_WIDTH*PIXELS_PER_METER, mapHeight: MAP_METERS_HEIGHT*PIXELS_PER_METER,
  defaultPlayers: 5, maxPlayers: 16, minSurvivors: 2,
  survivorSpeed: 170, walkSpeed: 96, crouchSpeed: 48, killerSpeedMultiplier: 1.15,
  survivorVision: 900, killerVisionMultiplier: 1, terrorRadius: 32*PIXELS_PER_METER,
  generatorCount: 7, generatorGoal: 5, generatorSeconds: 90,
  rescueSeconds: 1, healSeconds: 16, hookSeconds: 70, bleedSeconds: 240,
  stunSeconds: 2, breakPalletSeconds: 2.34, kickSeconds: 1.8,
  gateSeconds: 20, endgameSeconds: 120, wiggleSeconds: 16,
  attackRange: 100, attackCooldown: 2.7, attackMissCooldown: 1.5,
  tickRate: 30, interactionRadius: 80, playerRadius: 15,
  disconnectGraceSeconds: 30, releaseImmunitySeconds: 10,
  hitBoostSeconds: 1.8, hitBoostSpeed: 6.6*PIXELS_PER_METER,
  pickupSeconds: 3, scratchSeconds: 10, selfMendSeconds: 10, friendMendSeconds: 6,
  campRadius: 16*PIXELS_PER_METER, skillFailureSeconds: 3,
});
