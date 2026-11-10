import { toMoneyPrinter } from './map.js';

export const MPT_COMPLETE = 1;
export const MPT_FAILED = -1;

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    const error = new Error('MoneyPrinterTurbo returned invalid JSON');
    error.code = 'render_failed';
    error.retry = true;
    throw error;
  }
}

export async function runMoneyPrinter(job, {
  baseUrl,
  fetchImpl,
  fontName,
  heartbeat,
  sleep,
  signal,
  pollMs = 3000,
  now = () => Date.now(),
}) {
  const root = String(baseUrl || '').replace(/\/$/, '');
  const createdResponse = await fetchImpl(`${root}/api/v1/videos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(toMoneyPrinter(job, { fontName })),
  });
  const created = await readJson(createdResponse);
  if (!createdResponse.ok || !created?.data?.task_id) {
    const error = new Error('MoneyPrinterTurbo did not accept the video');
    error.code = 'render_failed';
    error.retry = createdResponse.status >= 500 || createdResponse.status === 429;
    throw error;
  }
  const taskId = created.data.task_id;
  for (;;) {
    if (signal?.aborted) {
      const error = new Error('cancelled');
      error.code = 'cancelled';
      error.retry = false;
      throw error;
    }
    if (job.deadlineAt && Date.parse(job.deadlineAt) <= now()) {
      const error = new Error('job deadline reached');
      error.code = 'render_timeout';
      error.retry = false;
      throw error;
    }
    const response = await fetchImpl(`${root}/api/v1/tasks/${encodeURIComponent(taskId)}`);
    const task = await readJson(response);
    const state = task?.data?.state;
    if (state === MPT_COMPLETE) return task.data;
    if (state === MPT_FAILED) {
      const error = new Error(String(task?.data?.error || 'render failed').replace(/https?:\/\/\S+/gi, '[url]').slice(0, 300));
      error.code = 'render_failed';
      error.retry = false;
      throw error;
    }
    if (heartbeat) await heartbeat();
    await sleep(pollMs);
  }
}
