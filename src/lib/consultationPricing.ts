export const CONSULTATION_BASE_RATE = 75;
export const CONSULTATION_EXTRA_RATE = 50;

export function calculateConsultationPricing(hours: number, customLaborCharge: number | null = null) {
  const billedHours = Math.max(1, Number(hours) || 1);
  const extraHours = Math.max(0, billedHours - 1);
  const automaticLaborCharge = CONSULTATION_BASE_RATE + (extraHours * CONSULTATION_EXTRA_RATE);
  const laborCharge = customLaborCharge == null
    ? automaticLaborCharge
    : Math.max(0, Number(customLaborCharge) || 0);

  return { billedHours, extraHours, automaticLaborCharge, laborCharge };
}
