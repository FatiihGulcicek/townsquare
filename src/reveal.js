import Vue from "vue";

/* shared state of the "You are the X" card */
export const revealState = Vue.observable({ open: false });

export function showMyCharacter() {
  revealState.open = true;
}
