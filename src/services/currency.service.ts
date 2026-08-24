import { ValidationError } from '../utils/errors.ts';

export interface CurrencyConversionResult {
  originalAmount: number;
  originalCurrency: string;
  targetCurrency: string;
  exchangeRate: number;
  convertedAmount: number;
  rateSource: string;
  rateDate: Date;
}

export const convertCurrency = (
  amount: number,
  originalCurrency: string,
  targetCurrency: string = 'USD',
  customRate?: number,
  source: string = 'MANUAL_OFFICIAL'
): CurrencyConversionResult => {
  if (amount < 0) {
    throw new ValidationError('El monto a convertir no puede ser negativo.');
  }

  const rateDate = new Date();
  const orig = (originalCurrency || 'USD').toUpperCase();
  const target = (targetCurrency || 'USD').toUpperCase();

  // Si ambas monedas son iguales, tasa forzada a 1 (Paridad)
  if (orig === target) {
    return {
      originalAmount: amount,
      originalCurrency: orig,
      targetCurrency: target,
      exchangeRate: 1,
      convertedAmount: Math.round(amount * 100) / 100,
      rateSource: 'PARITY',
      rateDate,
    };
  }

  // Moneda diferente requiere tasa estrictamente positiva
  if (customRate === undefined || customRate === null) {
    throw new ValidationError(`Se requiere una tasa de cambio explícita para convertir de ${orig} a ${target}.`);
  }

  if (customRate <= 0) {
    throw new ValidationError(`La tasa de cambio para ${orig}/${target} debe ser estrictamente mayor a 0 (recibido: ${customRate}).`);
  }

  if (!source || source.trim() === '') {
    throw new ValidationError('La fuente de cotización de la tasa de cambio es obligatoria.');
  }

  const convertedAmount = Math.round((amount * customRate) * 100) / 100;

  return {
    originalAmount: amount,
    originalCurrency: orig,
    targetCurrency: target,
    exchangeRate: customRate,
    convertedAmount,
    rateSource: source,
    rateDate,
  };
};
