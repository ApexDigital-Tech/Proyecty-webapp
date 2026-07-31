import { GoogleGenAI } from '@google/genai';
import { logger } from '../lib/logger.ts';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const generateFinancialReport = async (expensesData: any[]): Promise<string> => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY no configurada en el servidor');
    }

    const expensesSummary = expensesData.map(e => 
      `- ${e.date || e.createdAt}: ${e.title} | ${e.category} | $${e.amount} | Estado: ${e.status}`
    ).join('\n');

    const prompt = `
      Actúa como un Analista Financiero Senior. Analiza el siguiente listado de gastos de una organización y redacta un reporte ejecutivo breve en formato Markdown.
      Destaca lo siguiente:
      1. Resumen general de los gastos (tendencias, distribución).
      2. Áreas de mayor gasto o categorías críticas.
      3. Recomendaciones de optimización del presupuesto.

      Datos de Gastos:
      ${expensesSummary || 'No hay gastos registrados en el período actual.'}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
    });

    return response.text || 'El análisis no pudo ser generado.';
  } catch (error: any) {
    logger.error('Error generating AI report', { error });
    throw new Error('Error al procesar la solicitud con Gemini: ' + error.message);
  }
};
