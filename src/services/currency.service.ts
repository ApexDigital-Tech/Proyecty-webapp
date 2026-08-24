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
  const rateDate = new Date();
  
  if (originalCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
    return {
      originalAmount: amount,
      originalCurrency,
      targetCurrency,
      exchangeRate: 1,
      convertedAmount: amount,
      rateSource: 'PARITY',
      rateDate,
    };
  }

  const rate = customRate && customRate > 0 ? customRate : 1;
  const convertedAmount = Math.round((amount * rate) * 100) / 100;

  return {
    originalAmount: amount,
    originalCurrency,
    targetCurrency,
    exchangeRate: rate,
    convertedAmount,
    rateSource: source,
    rateDate,
  };
};
