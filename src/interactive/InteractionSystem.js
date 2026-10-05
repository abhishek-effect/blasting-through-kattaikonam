/**
 * InteractionSystem Module
 * Handles proximity triggers and prompts for elevators, doors, and progression items.
 */
export class InteractionSystem {
  constructor(elevator, hud) {
    this.elevator = elevator;
    this.hud = hud;
    this.activePrompt = null;
  }

  update(player, input) {
    if (!this.elevator) return;

    this.elevator.update(player);

    if (this.elevator.isPlayerNear) {
      this.activePrompt = {
        title: this.elevator.promptTitle,
        subtitle: this.elevator.promptSubtitle,
        isLocked: this.elevator.isLocked
      };

      if (input.checkAndConsumeInteract()) {
        this.elevator.interact(player, (targetFloor) => {
          if (this.hud && this.hud.showNotification) {
            this.hud.showNotification(`TRAVELING TO FLOOR ${targetFloor}...`);
          }
        });
      }
    } else {
      this.activePrompt = null;
    }

    if (this.hud) {
      this.hud.updateInteractionPrompt(this.activePrompt);
    }
  }
}
