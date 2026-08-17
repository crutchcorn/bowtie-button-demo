import { initializeBowtieButton } from './bowtie-button.js';

export function bootBowtieButton(documentRef = document, options = {}) {
  const button = documentRef.querySelector('.bowtie-button');
  if (!button) return null;

  return initializeBowtieButton(button, { ...options, documentRef });
}

export const autoController = bootBowtieButton();
