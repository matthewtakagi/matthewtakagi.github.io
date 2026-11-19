/** Wire a tablist to its panels. Safe to call again after a hot reload. */
export function bindTabs(list: HTMLElement) {
  if (list.dataset.tabsReady) return
  list.dataset.tabsReady = "true"

  const tabs = [
    ...list.querySelectorAll<HTMLButtonElement>(':scope > [role="tab"]'),
  ]

  const select = (tab: HTMLButtonElement) => {
    for (const item of tabs) {
      const on = item === tab
      item.setAttribute("aria-selected", on ? "true" : "false")
      item.tabIndex = on ? 0 : -1
      const panel = document.getElementById(
        item.getAttribute("aria-controls") ?? "",
      )
      if (panel) panel.hidden = !on
    }
  }

  list.addEventListener("click", (event) => {
    const tab = (event.target as Element | null)?.closest<HTMLButtonElement>(
      '[role="tab"]',
    )
    if (tab && tabs.includes(tab)) select(tab)
  })

  list.addEventListener("keydown", (event) => {
    const current = tabs.findIndex(
      (tab) => tab.getAttribute("aria-selected") === "true",
    )
    if (current < 0) return
    let next = current
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length
    else if (event.key === "ArrowLeft")
      next = (current - 1 + tabs.length) % tabs.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = tabs.length - 1
    else return
    event.preventDefault()
    select(tabs[next])
    tabs[next].focus()
  })
}
