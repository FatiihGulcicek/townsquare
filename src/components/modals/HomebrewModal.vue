<template>
  <Modal class="homebrew" v-if="modals.homebrew" @close="close">
    <div @keyup.stop="" @keydown.stop="">
      <h3>{{ $t("Homebrew Characters") }}</h3>

      <!-- list of saved characters -->
      <template v-if="!draft">
        <p class="hint" v-if="!characters.length">
          {{
            $t(
              "You have no homebrew characters yet. Create one and add it to your script; players in a live session receive it automatically.",
            )
          }}
        </p>
        <ul class="tokens" v-else>
          <li
            v-for="role in characters"
            :key="role.id"
            :class="[role.team, { selected: selected.includes(role.id) }]"
          >
            <div @click="toggleSelected(role.id)">
              <Token :role="displayRole(role)" />
            </div>
            <div class="actions">
              <font-awesome-icon
                icon="user-edit"
                :title="$t('Edit')"
                @click="edit(role)"
              />
              <font-awesome-icon
                icon="trash-alt"
                :title="$t('Delete')"
                @click="remove(role)"
              />
            </div>
          </li>
        </ul>
        <div class="button-group">
          <div class="button townsfolk" @click="edit()">
            <font-awesome-icon icon="plus-circle" />
            {{ $t("New character") }}
          </div>
          <div
            class="button"
            :class="{ disabled: !selected.length }"
            @click="addToScript"
          >
            <font-awesome-icon icon="theater-masks" />
            {{
              $t("Add {count} to current script", { count: selected.length })
            }}
          </div>
        </div>
        <div class="button-group">
          <div class="button" @click="exportJSON">
            <font-awesome-icon icon="copy" /> {{ $t("Copy as JSON") }}
          </div>
          <div class="button" @click="importJSON">
            <font-awesome-icon icon="clipboard" />
            {{ $t("Import from Clipboard") }}
          </div>
        </div>
      </template>

      <!-- editor -->
      <form v-else class="editor" @submit.prevent="save">
        <div class="preview">
          <Token :role="displayRole(draft)" />
          <label class="upload button">
            <font-awesome-icon icon="image" /> {{ $t("Image") }}
            <input type="file" accept="image/*" @change="uploadImage" />
          </label>
          <span
            class="clear-image"
            v-if="draft.image"
            @click="draft.image = ''"
            >{{ $t("Remove image") }}</span
          >
        </div>
        <div class="fields">
          <label>
            {{ $t("Name") }}
            <input v-model.trim="draft.name" required maxlength="40" />
          </label>
          <label>
            {{ $t("Team") }}
            <select v-model="draft.team">
              <option v-for="team in teams" :key="team" :value="team">
                {{ $t(team) }}
              </option>
            </select>
          </label>
          <label class="wide">
            {{ $t("Ability") }}
            <textarea
              v-model.trim="draft.ability"
              required
              rows="3"
              maxlength="400"
            ></textarea>
          </label>
          <label class="wide">
            {{ $t("Reminder tokens (comma separated)") }}
            <input v-model="remindersText" maxlength="200" />
          </label>
          <label>
            {{ $t("First night: wakes after") }}
            <select v-model.number="draft.firstNight">
              <option :value="0">{{ $t("Does not wake") }}</option>
              <option
                v-for="slot in firstNightSlots"
                :key="slot.value"
                :value="slot.value"
              >
                {{ slot.name }}
              </option>
            </select>
          </label>
          <label>
            {{ $t("Other nights: wakes after") }}
            <select v-model.number="draft.otherNight">
              <option :value="0">{{ $t("Does not wake") }}</option>
              <option
                v-for="slot in otherNightSlots"
                :key="slot.value"
                :value="slot.value"
              >
                {{ slot.name }}
              </option>
            </select>
          </label>
          <label class="wide" v-if="draft.firstNight">
            {{ $t("First night reminder (Storyteller only)") }}
            <input v-model.trim="draft.firstNightReminder" maxlength="300" />
          </label>
          <label class="wide" v-if="draft.otherNight">
            {{ $t("Other nights reminder (Storyteller only)") }}
            <input v-model.trim="draft.otherNightReminder" maxlength="300" />
          </label>
          <label class="check">
            <input type="checkbox" v-model="draft.setup" />
            {{ $t("Modifies game setup [+/- Outsiders etc.]") }}
          </label>
        </div>
        <div class="button-group">
          <button type="submit" class="button townsfolk">
            {{ $t("Save") }}
          </button>
          <div class="button" @click="draft = null">{{ $t("Cancel") }}</div>
        </div>
      </form>
    </div>
  </Modal>
</template>

<script>
import { mapState } from "vuex";
import Modal from "./Modal";
import Token from "../Token";
import rolesJSON from "../../roles.json";
import nightsheet from "../../nightsheet.json";
import { t } from "../../i18n";

const STORAGE_KEY = "homebrew";
const TEAMS = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveler",
  "fabled",
];
const GENERIC = {
  townsfolk: "generic-townsfolk",
  outsider: "generic-outsider",
  minion: "generic-minion",
  demon: "generic-demon",
  traveler: "generic-traveler",
  fabled: "generic-fabled",
};

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function slugify(name) {
  const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  return (
    "hb_" +
    name
      .toLocaleLowerCase("tr")
      .replace(/[çğıöşü]/g, (c) => map[c])
      .normalize("NFKD")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 30)
  );
}

// "wakes after X" slots built from the official night order (half steps sit between characters)
function slots(key, extra) {
  const list = rolesJSON
    .filter((r) => r[key])
    .map((r) => ({ name: r.name, pos: r[key] }))
    .concat(extra)
    .sort((a, b) => a.pos - b.pos);
  const seen = new Set();
  return [{ name: t("Dusk (start of the night)"), value: 0.5 }].concat(
    list
      .filter((s) => !seen.has(s.pos) && seen.add(s.pos))
      .map((s) => ({ name: s.name, value: s.pos + 0.5 })),
  );
}

export default {
  components: { Modal, Token },
  data() {
    return {
      characters: load(),
      selected: [],
      draft: null,
      remindersText: "",
      teams: TEAMS,
    };
  },
  computed: {
    firstNightSlots() {
      return slots("firstNight", [
        { name: t("Minion info"), pos: nightsheet.minioninfo },
        { name: t("Demon info & bluffs"), pos: nightsheet.demoninfo },
      ]);
    },
    otherNightSlots() {
      return slots("otherNight", []);
    },
    ...mapState(["modals", "roles", "fabled", "edition"]),
  },
  watch: {
    "modals.homebrew"(open) {
      if (open) {
        this.characters = load();
        // preselect characters already in the script
        this.selected = this.characters
          .filter((c) => this.roles.has(c.id) || this.fabled.has(c.id))
          .map((c) => c.id);
      }
    },
  },
  methods: {
    close() {
      this.draft = null;
      this.$store.commit("toggleModal", "homebrew");
    },
    displayRole(role) {
      return Object.assign({}, role, {
        id: role.id || "hb_preview",
        imageAlt: GENERIC[role.team] || "custom",
        edition: "custom",
        name: role.name || "?",
      });
    },
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.characters));
    },
    toggleSelected(id) {
      const index = this.selected.indexOf(id);
      if (index > -1) this.selected.splice(index, 1);
      else this.selected.push(id);
    },
    edit(role) {
      this.draft = Object.assign(
        {
          id: "",
          name: "",
          team: "townsfolk",
          ability: "",
          image: "",
          reminders: [],
          setup: false,
          firstNight: 0,
          firstNightReminder: "",
          otherNight: 0,
          otherNightReminder: "",
        },
        role ? JSON.parse(JSON.stringify(role)) : {},
      );
      this.remindersText = this.draft.reminders.join(", ");
    },
    save() {
      const draft = this.draft;
      if (!draft.name || !draft.ability) return;
      draft.reminders = this.remindersText
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean)
        .slice(0, 10);
      if (!draft.firstNight) draft.firstNightReminder = "";
      if (!draft.otherNight) draft.otherNightReminder = "";
      if (!draft.id) {
        let id = slugify(draft.name) || "hb_character";
        let suffix = 2;
        const base = id;
        while (this.characters.some((c) => c.id === id)) id = base + suffix++;
        draft.id = id;
      }
      const index = this.characters.findIndex((c) => c.id === draft.id);
      if (index > -1) this.characters.splice(index, 1, draft);
      else this.characters.push(draft);
      if (!this.selected.includes(draft.id)) this.selected.push(draft.id);
      this.persist();
      this.draft = null;
    },
    remove(role) {
      if (!confirm(this.$t("Delete {name}?", { name: role.name }))) return;
      this.characters = this.characters.filter((c) => c.id !== role.id);
      this.selected = this.selected.filter((id) => id !== role.id);
      this.persist();
    },
    uploadImage(event) {
      const file = event.target.files[0];
      event.target.value = "";
      if (!file) return;
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        // downscale so the image can be synced to players cheaply
        const size = 160;
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        let data = canvas.toDataURL("image/webp", 0.85);
        if (!data.startsWith("data:image/webp")) {
          data = canvas.toDataURL("image/png");
        }
        this.draft.image = data;
        URL.revokeObjectURL(url);
      };
      img.src = url;
    },
    addToScript() {
      if (!this.selected.length) return;
      const homebrewIds = new Set(this.characters.map((c) => c.id));
      // keep the current script (minus homebrew, which gets re-added fresh)
      const current = [...this.roles.values()]
        .filter((r) => !homebrewIds.has(r.id))
        .map((r) => (r.isCustom ? this.stripRole(r) : { id: r.id }));
      const customFabled = [...this.fabled.values()]
        .filter((r) => r.isCustom && !homebrewIds.has(r.id))
        .map((r) => this.stripRole(r));
      const homebrew = this.characters
        .filter((c) => this.selected.includes(c.id))
        .map((c) => this.stripRole(c));
      const roles = [...current, ...customFabled, ...homebrew];
      const name = this.edition.isOfficial
        ? `${this.edition.name} + ${this.$t("Homebrew")}`
        : this.edition.name || this.$t("Homebrew Script");
      const meta = this.edition.isOfficial
        ? { id: "custom", name }
        : Object.assign({}, this.edition, { id: "custom", name });
      this.$store.commit("setCustomRoles", roles);
      this.$store.commit("setEdition", meta);
      this.close();
    },
    stripRole(role) {
      const out = {};
      [
        "id",
        "name",
        "team",
        "ability",
        "image",
        "reminders",
        "remindersGlobal",
        "setup",
        "firstNight",
        "firstNightReminder",
        "otherNight",
        "otherNightReminder",
      ].forEach((key) => {
        if (role[key] !== undefined && role[key] !== "") out[key] = role[key];
      });
      return out;
    },
    async exportJSON() {
      const json = JSON.stringify(
        this.characters.map((c) => this.stripRole(c)),
        null,
        2,
      );
      try {
        await navigator.clipboard.writeText(json);
        alert(this.$t("Copied to clipboard."));
      } catch (e) {
        prompt(this.$t("Copy the JSON below:"), json);
      }
    },
    async importJSON() {
      let text;
      try {
        text = await navigator.clipboard.readText();
      } catch (e) {
        text = prompt(this.$t("Paste homebrew JSON:"));
      }
      if (!text) return;
      try {
        const list = JSON.parse(text);
        const roles = (Array.isArray(list) ? list : [list]).filter(
          (r) => r && r.id !== "_meta" && r.name && r.ability,
        );
        roles.forEach((r) => {
          const role = this.stripRole(r);
          if (role.team === "traveller") role.team = "traveler";
          if (role.team === "loric") role.team = "fabled";
          if (!TEAMS.includes(role.team)) role.team = "townsfolk";
          role.id = role.id
            ? String(role.id)
                .replace(/[^a-z0-9_]/gi, "")
                .toLowerCase()
            : slugify(role.name);
          if (!role.reminders) role.reminders = [];
          const index = this.characters.findIndex((c) => c.id === role.id);
          if (index > -1) this.characters.splice(index, 1, role);
          else this.characters.push(role);
        });
        this.persist();
        alert(this.$t("Imported {count} characters.", { count: roles.length }));
      } catch (e) {
        alert(this.$t("Unable to parse JSON: ") + e.message);
      }
    },
  },
};
</script>

<style lang="scss" scoped>
@import "../../vars.scss";

h3 {
  margin: 0 40px 10px;
}

.hint {
  max-width: 500px;
  margin: 10px auto;
  text-align: center;
  opacity: 0.8;
}

ul.tokens {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  padding: 0;
  margin: 0 0 10px;
  li {
    list-style: none;
    width: 6vmax;
    margin: 5px;
    opacity: 0.5;
    transition: opacity 250ms;
    cursor: pointer;
    &.selected {
      opacity: 1;
    }
    .token {
      height: 6vmax;
      width: 6vmax;
    }
    .actions {
      display: flex;
      justify-content: space-around;
      margin-top: 4px;
      opacity: 1;
      svg:hover {
        color: red;
      }
    }
  }
}

.editor {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 780px;
  .preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    .token {
      width: 140px;
      height: 140px;
    }
    .upload {
      padding: 4px 12px;
      cursor: pointer;
      input {
        display: none;
      }
    }
    .clear-image {
      font-size: 80%;
      text-decoration: underline;
      cursor: pointer;
    }
  }
  .fields {
    flex: 1;
    min-width: 260px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    font-size: 85%;
    gap: 3px;
    &.wide,
    &.check {
      grid-column: 1 / -1;
    }
    &.check {
      flex-direction: row;
      align-items: center;
      gap: 8px;
    }
  }
  input:not([type]),
  select,
  textarea {
    background: rgba(0, 0, 0, 0.5);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 4px;
    padding: 5px;
    font-family: inherit;
    font-size: 110%;
  }
  .button-group {
    flex-basis: 100%;
  }
  button.button {
    color: white;
    font: inherit;
    cursor: pointer;
  }
}

@media (max-width: 600px) {
  .editor .fields {
    grid-template-columns: 1fr;
  }
}
</style>

<style lang="scss">
.modal-backdrop.homebrew .modal {
  background: rgba(0, 0, 0, 0.92);
}
</style>
