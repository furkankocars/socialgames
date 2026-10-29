import { readFileSync } from "node:fs";

// answers.txt holds the words a round can be about, one line per length (4, 5
// and 6 letters): everyday root words from the TDK word list, picked by how
// often they show up in Turkish subtitles (FrequencyWords, OpenSubtitles 2018),
// minus function words, infinitives and rude words. words.txt holds every word
// a guess may be: the TDK list plus common inflected forms, so "evler" counts.

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

export const LINGO_ANSWERS: Record<number, string[]> = Object.fromEntries(
  read("./answers.txt")
    .trim()
    .split("\n")
    .map((line) => {
      const words = line.split(" ");
      return [words[0].length, words];
    }),
);

export const LINGO_WORDS = new Set([...read("./words.txt").trim().split(" "), ...Object.values(LINGO_ANSWERS).flat()]);

/** Lower-cases the Turkish way (I → ı, İ → i) and drops circumflexes. */
export function normalize(word: string): string {
  return word
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u");
}
