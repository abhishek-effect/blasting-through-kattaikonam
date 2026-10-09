/**
 * InteractionSystem Module
 * Handles proximity triggers and prompts for elevators, doors, and progression items.
 */
export class InteractionSystem {
  constructor(levelOrElevator, hud, enemySpawner = null) {
    if (levelOrElevator && levelOrElevator.elevator !== undefined) {
      this.level = levelOrElevator;
      this.elevator = levelOrElevator.elevator;
    } else {
      this.level = null;
      this.elevator = levelOrElevator;
    }
    this.hud = hud;
    this.enemySpawner = enemySpawner;
    this.activePrompt = null;
  }

  update(player, input) {
    let promptFound = false;

    // 1. Check Elevator Interaction
    if (this.elevator) {
      this.elevator.update(player);

      if (this.elevator.isPlayerNear) {
        promptFound = true;
        this.activePrompt = {
          title: this.elevator.promptTitle,
          subtitle: this.elevator.promptSubtitle,
          isLocked: this.elevator.isLocked
        };

        if (input && input.checkAndConsumeInteract()) {
          this.elevator.interact(player, (targetFloor) => {
            if (this.hud && this.hud.showNotification) {
              this.hud.showNotification(`TRAVELING TO FLOOR ${targetFloor}...`);
            }
          });
        }
      }
    }

    // 2. Check Seminar Hall Gate (Requires 20 Kills)
    if (!promptFound && this.level && this.level.seminarGate) {
      const gate = this.level.seminarGate;
      const dist = Math.hypot(player.position.x - gate.x, player.position.z - gate.z);

      if (dist < 3.8) {
        promptFound = true;
        const kills = this.enemySpawner ? this.enemySpawner.totalKills : 0;

        if (kills < gate.requiresKills) {
          this.activePrompt = {
            title: 'SEMINAR HALL: SECURITY LOCKDOWN',
            subtitle: `Eliminate 20 campus enemies to enter (${kills}/${gate.requiresKills} Kills)`,
            isLocked: true
          };
        } else {
          if (!gate.isUnlocked) {
            this.level.unlockSeminarGate();
            if (this.hud && this.hud.showNotification) {
              this.hud.showNotification('🔓 SEMINAR HALL UNLOCKED! AUDITORIUM OPEN!');
            }
          }
          this.activePrompt = {
            title: 'SEMINAR HALL',
            subtitle: 'Security cleared. Welcome to the auditorium!',
            isLocked: false
          };
        }
      }
    }

    // 3. Check Interactable Campus Doors
    if (!promptFound && this.level && this.level.doors && this.level.doors.length > 0) {
      let nearestDoor = null;
      let minDoorDist = Infinity;

      for (let i = 0; i < this.level.doors.length; i++) {
        const door = this.level.doors[i];
        const dist = Math.hypot(player.position.x - door.x, player.position.z - door.z);
        if (dist <= door.interactionRadius && dist < minDoorDist) {
          minDoorDist = dist;
          nearestDoor = door;
        }
      }

      if (nearestDoor) {
        promptFound = true;
        const kills = this.enemySpawner ? this.enemySpawner.totalKills : 0;
        this.activePrompt = nearestDoor.getPromptInfo(kills);

        if (input && input.checkAndConsumeInteract()) {
          nearestDoor.toggle();
          this.activePrompt = nearestDoor.getPromptInfo(kills);
        }
      }
    }

    if (!promptFound) {
      this.activePrompt = null;
    }

    if (this.hud) {
      this.hud.updateInteractionPrompt(this.activePrompt);
    }
  }
}
