const TERMS = {
  promo: 'product commercial city',
  story: 'cinematic story b-roll',
  calm: 'nature calm aesthetic',
};

const RATES = {
  promo: 1.05,
  story: 1,
  calm: 0.92,
};

/**
 * Map a claimed Lines job onto MoneyPrinterTurbo's POST /api/v1/videos body.
 * Stock footage is Pixabay. Speech is Edge TTS. A supplied script is used as
 * the narration; a prompt alone is sent as the script instruction so the local
 * LLM writes it.
 */
export function toMoneyPrinter(job, { fontName } = {}) {
  if (!job || job.engine !== 'moneyprinter') {
    throw new Error('this worker only renders moneyprinter jobs');
  }
  const narration = job.script?.text?.trim() || '';
  const font = fontName || 'NotoNaskhArabic-Regular.ttf';
  return {
    video_subject: job.title,
    video_script: narration,
    video_script_prompt: narration ? '' : (job.prompt || ''),
    custom_system_prompt: !narration && job.language === 'ar'
      ? 'اكتب التعليق بالعربية. إذا احتجت اسم علامة فاستخدم «اكسبرتو».'
      : '',
    video_terms: TERMS[job.style] || TERMS.story,
    video_aspect: job.format,
    video_concat_mode: 'random',
    video_clip_duration: job.seconds === 60 ? 5 : job.seconds === 30 ? 4 : 3,
    video_count: 1,
    video_source: 'pixabay',
    video_language: job.language,
    voice_name: job.voice || (job.language === 'ar' ? 'ar-SA-HamedNeural' : 'en-US-JennyNeural'),
    voice_volume: 1,
    voice_rate: RATES[job.style] || 1,
    bgm_type: 'random',
    bgm_volume: job.style === 'calm' ? 0.12 : 0.2,
    subtitle_enabled: true,
    subtitle_position: 'bottom',
    font_name: font,
    text_fore_color: '#FFFFFF',
    font_size: job.format === '9:16' ? 60 : 48,
    stroke_color: '#000000',
    stroke_width: 1.5,
    n_threads: 2,
    paragraph_number: job.seconds === 60 ? 4 : job.seconds === 30 ? 2 : 1,
  };
}
