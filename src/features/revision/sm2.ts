export type SM2State = {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewDate: number;
  lastReviewedAt?: number;
};

export type SM2Grade = 'again' | 'hard' | 'good' | 'easy';

export function sm2Update(current: SM2State, grade: SM2Grade, now = Date.now()): SM2State {
  const quality = grade === 'again' ? 0 : grade === 'hard' ? 3 : grade === 'good' ? 4 : 5;
  let { easeFactor, intervalDays, repetitions } = current;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
  }

  const efDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  easeFactor = Math.min(2.8, Math.max(1.3, easeFactor + efDelta));

  return {
    easeFactor,
    intervalDays,
    repetitions,
    nextReviewDate: now + intervalDays * 86400000,
    lastReviewedAt: now,
  };
}

export function defaultSm2State(): SM2State {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    nextReviewDate: Date.now(),
  };
}
