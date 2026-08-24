import { GoogleGenAI } from '@google/genai';
import { logger } from '../lib/logger.ts';
import { logAuditEvent } from './audit.service.ts';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface AiReportResponse {
  reportMarkdown: string;
  model: string;
  modelVersion: string;
  sources: { id: number; title: string; amount: number; category: string; status: string }[];
  generatedAt: string;
  requiresHumanReview: boolean;
  reviewedBy?: number | null;
}

/**
 * Genera reporte financiero con IA y trazabilidad estricta de fuentes citables (AI-01).
 */
export const generateFinancialReport = async (
  tenantId: number,
  userId: number,
  expensesData: any[]
): Promise<AiReportResponse> => {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('YOUR_')) {
      logger.warn('[AI Service] GEMINI_API_KEY no configurada. Generando reporte financiero de respaldo estructurado.');
      
      const totalAmount = expensesData.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
      const approvedCount = expensesData.filter(e => e.status === 'approved').length;
      const pendingCount = expensesData.filter(e => e.status === 'pending').length;

      const fallbackMarkdown = `## Resumen Ejecutivo Financiero y Trazabilidad (IA-Core)

### 1. Diagnóstico de Ejecución
- **Monto Total Analizado:** $${totalAmount.toLocaleString()} USD
- **Comprobantes Aprobados:** ${approvedCount}
- **Comprobantes Pendientes:** ${pendingCount}

### 2. Evidencia y Fuentes Citadas
${expensesData.map(e => `- **[Gasto #${e.id}]** ${e.title} ($${e.amount} - ${e.category}) ➔ Estado: \`${e.status}\``).join('\n') || '- *Sin registros transaccionales.*'}

### 3. Recomendaciones de Control
- Mantener la segregación de funciones (FIN-01) en la aprobación de comprobantes pendientes.
- Revisar mensualmente las desviaciones presupuestarias respecto a la línea base V1.
`;

      const sourcesList = expensesData.map(e => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        category: e.category,
        status: e.status,
      }));

      // Log in audit trail
      logAuditEvent({
        tenantId,
        userId,
        action: 'AI_REPORT_GENERATED',
        entity: 'ai_report',
        entityId: 'FINANCIAL_SUMMARY',
        metadata: {
          model: 'rule-based-fallback',
          totalRecordsAnalyzed: expensesData.length,
          totalAmount,
        },
      });

      return {
        reportMarkdown: fallbackMarkdown,
        model: 'rule-based-fallback',
        modelVersion: '2026.1',
        sources: sourcesList,
        generatedAt: new Date().toISOString(),
        requiresHumanReview: true,
      };
    }

    const expensesSummary = expensesData.map(e => 
      `- [Ref #${e.id}] Fecha: ${e.date || e.createdAt} | Concepto: "${e.title}" | Categoría: ${e.category} | Monto: $${e.amount} | Estado: ${e.status}`
    ).join('\n');

    const prompt = `
      Eres un Auditor Financiero y Consultor Senior de Proyectos de Cooperación y SaaS.
      Analiza el siguiente conjunto de datos transaccionales de gastos y genera un reporte ejecutivo en formato Markdown.
      
      REGLAS DE AUDITORÍA Y TRAZABILIDAD (Mandatorio):
      1. Cada afirmación de cifras o anomalías DEBE citar la referencia del gasto exacto usando el formato "[Gasto #ID]".
      2. Divide el informe en: 
         - Resumen de Ejecución y Tendencias.
         - Desglose por Partidas Críticas (con citas).
         - Recomendaciones y Alertas de Control Interno.
      3. No inventes gastos ni cifras no presentes en los datos.

      Datos de Gastos:
      ${expensesSummary || 'No hay gastos registrados en el período actual.'}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const reportMarkdown = response.text || 'El análisis no pudo ser generado.';
    const sourcesList = expensesData.map(e => ({
      id: e.id,
      title: e.title,
      amount: e.amount,
      category: e.category,
      status: e.status,
    }));

    // Registrar en auditoría inmutable
    logAuditEvent({
      tenantId,
      userId,
      action: 'AI_REPORT_GENERATED',
      entity: 'ai_report',
      entityId: 'FINANCIAL_SUMMARY',
      metadata: {
        model: 'gemini-2.5-flash',
        modelVersion: '2026-flash',
        totalRecordsAnalyzed: expensesData.length,
      },
    });

    return {
      reportMarkdown,
      model: 'gemini-2.5-flash',
      modelVersion: '2026-flash',
      sources: sourcesList,
      generatedAt: new Date().toISOString(),
      requiresHumanReview: true,
    };
  } catch (error: any) {
    logger.warn('[AI Service] Fallo en servicio externo de Gemini, activando fallback estructurado auditado:', { error: error?.message });
    
    const totalAmount = expensesData.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    const approvedCount = expensesData.filter(e => e.status === 'approved').length;
    const pendingCount = expensesData.filter(e => e.status === 'pending').length;

    const fallbackMarkdown = `## Resumen Ejecutivo Financiero y Trazabilidad (IA-Core)

### 1. Diagnóstico de Ejecución
- **Monto Total Analizado:** $${totalAmount.toLocaleString()} USD
- **Comprobantes Aprobados:** ${approvedCount}
- **Comprobantes Pendientes:** ${pendingCount}

### 2. Evidencia y Fuentes Citadas (AI-01)
${expensesData.map(e => `- **[Gasto #${e.id}]** ${e.title} ($${e.amount} - ${e.category}) ➔ Estado: \`${e.status}\``).join('\n') || '- *Sin registros transaccionales.*'}

### 3. Recomendaciones de Control
- Mantener la segregación de funciones (FIN-01) en la aprobación de comprobantes pendientes.
- Revisar mensualmente las desviaciones presupuestarias respecto a la línea base V1.
`;

    const sourcesList = expensesData.map(e => ({
      id: e.id,
      title: e.title,
      amount: e.amount,
      category: e.category,
      status: e.status,
    }));

    return {
      reportMarkdown: fallbackMarkdown,
      model: 'rule-based-fallback',
      modelVersion: '2026.1',
      sources: sourcesList,
      generatedAt: new Date().toISOString(),
      requiresHumanReview: true,
    };
  }
};
