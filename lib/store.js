/**
 * Almacenamiento simple en disco (data/store.json):
 * - Perfil de marca extraído del manual (PDF)
 * - Grupos de imágenes de ejemplo por categoría
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { brand: null, groups: [] };
  }
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(data));
}

export const store = {
  // --- Manual de marca ---
  getBrand() {
    return load().brand;
  },
  setBrand({ fileName, profile }) {
    const data = load();
    data.brand = { fileName, profile, updatedAt: new Date().toISOString() };
    save(data);
    return data.brand;
  },
  clearBrand() {
    const data = load();
    data.brand = null;
    save(data);
  },

  // --- Grupos de ejemplos ---
  listGroups() {
    return load().groups.map(({ id, name, images }) => ({
      id,
      name,
      count: images.length,
      // miniaturas: solo la primera imagen para no inflar la respuesta
      preview: images[0] || null,
    }));
  },
  getGroup(id) {
    return load().groups.find((g) => g.id === id) || null;
  },
  addGroup(name, images) {
    const data = load();
    const group = { id: crypto.randomUUID(), name, images };
    data.groups.push(group);
    save(data);
    return { id: group.id, name: group.name, count: images.length };
  },
  deleteGroup(id) {
    const data = load();
    const before = data.groups.length;
    data.groups = data.groups.filter((g) => g.id !== id);
    save(data);
    return data.groups.length < before;
  },
};
