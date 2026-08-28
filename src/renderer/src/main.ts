import './style.css'

const version = document.querySelector<HTMLSpanElement>('#version')!
const status = document.querySelector<HTMLElement>('#status')!
const progress = document.querySelector<HTMLProgressElement>('#progress')!
const checkButton = document.querySelector<HTMLButtonElement>('#check')!
const installButton = document.querySelector<HTMLButtonElement>('#install')!

void window.updater.getVersion().then((value) => {
  version.textContent = `v${value}`
})

window.updater.onState((state) => {
  status.textContent = state.message
  checkButton.disabled = state.status === 'checking' || state.status === 'downloading'
  progress.hidden = state.status !== 'downloading'
  progress.value = state.percent ?? 0
  installButton.hidden = state.status !== 'downloaded'
})

checkButton.addEventListener('click', async () => {
  status.textContent = '正在检查更新…'
  const result = await window.updater.check()
  if (!result.ok && result.message) status.textContent = result.message
})

installButton.addEventListener('click', () => {
  void window.updater.install()
})
