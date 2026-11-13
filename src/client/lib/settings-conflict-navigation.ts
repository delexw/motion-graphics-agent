/** Focus the actual editable control, rather than a section carrying the same label. */
export function focusSettingControl(root: HTMLElement | null, label: string): boolean {
  if (!root) return false;
  const control = Array.from(
    root.querySelectorAll<HTMLElement>(
      "textarea[aria-label], input[aria-label], button[aria-label], [role=combobox][aria-label], [contenteditable=true][aria-label]",
    ),
  ).find((element) => element.getAttribute("aria-label") === label);
  if (!control) return false;
  const details = control.closest("details");
  if (details) details.open = true;
  control.scrollIntoView({ block: "center" });
  control.focus();
  return true;
}
