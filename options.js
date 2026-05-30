import { LABEL_ALPHABET } from "./lib/labels.js";

const alphabet = document.querySelector("#alphabet");

for (const label of LABEL_ALPHABET) {
  const item = document.createElement("li");
  item.textContent = label;
  alphabet.append(item);
}
