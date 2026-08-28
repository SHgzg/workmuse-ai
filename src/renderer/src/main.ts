import './style.css'

const version = document.querySelector<HTMLSpanElement>('#version')!
const status = document.querySelector<HTMLElement>('#status')!
const progress = document.querySelector<HTMLProgressElement>('#progress')!
const progressValue = document.querySelector<HTMLElement>('#progress-value')!
const statusCard = document.querySelector<HTMLElement>('#status-card')!
const statusDetail = document.querySelector<HTMLElement>('#status-detail')!
const checkButton = document.querySelector<HTMLButtonElement>('#check')!
const installButton = document.querySelector<HTMLButtonElement>('#install')!

const statusDetails: Record<string, string> = {
  idle: '正在确认你的版本信息', checking: '这通常只需要几秒钟', available: '下载将在后台自动开始',
  'not-available': '你已拥有最新功能和安全改进', downloading: '请保持网络连接，下载可在后台进行',
  downloaded: '保存工作后即可完成更新', error: '请检查网络连接后重试', disabled: '安装正式版本后即可使用在线更新'
}

void window.updater.getVersion().then((value) => {
  version.textContent = `v${value}`
})

window.updater.onState((state) => {
  status.textContent = state.message
  statusDetail.textContent = statusDetails[state.status]
  statusCard.className = `status-card status-${state.status}`
  checkButton.disabled = state.status === 'checking' || state.status === 'downloading'
  progress.hidden = state.status !== 'downloading'
  progress.value = state.percent ?? 0
  progressValue.hidden = state.status !== 'downloading'
  progressValue.textContent = `${Math.round(state.percent ?? 0)}%`
  installButton.hidden = state.status !== 'downloaded'
})

checkButton.addEventListener('click', async () => {
  status.textContent = '正在检查更新…'
  statusDetail.textContent = statusDetails.checking
  statusCard.className = 'status-card status-checking'
  checkButton.disabled = true
  const result = await window.updater.check()
  if (!result.ok && result.message) {
    status.textContent = result.message
    statusDetail.textContent = statusDetails.disabled
    statusCard.className = 'status-card status-disabled'
    checkButton.disabled = false
  }
})

installButton.addEventListener('click', () => {
  void window.updater.install()
})
