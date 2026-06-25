import React from 'react';
import { Project, UserRole, Agreement, BudgetItem, Voucher, DocumentFile, Clause, Disbursement } from '../types.ts';
import { hasPermission } from '../lib/rbac.ts';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  TrendingUp,
  FileSpreadsheet,
  FileCheck2,
  FileText,
  Plus,
  Trash2,
  Lock,
  Download,
  CheckCircle,
  Clock,
  Sparkles,
  AlertTriangle,
  Layers,
  AlertOctagon,
} from 'lucide-react';
import TabResumen from './ProjectTabs/TabResumen.tsx';
import TabConvenio from './ProjectTabs/TabConvenio.tsx';
import TabPresupuesto from './ProjectTabs/TabPresupuesto.tsx';
import TabComprobantes from './ProjectTabs/TabComprobantes.tsx';
import TabDocumentos from './ProjectTabs/TabDocumentos.tsx';
import TabReporteAI from './ProjectTabs/TabReporteAI.tsx';
import { PageHeaderSkeleton, DashboardGridSkeleton } from './common/Skeletons.tsx';

interface ProjectDetailProps {
  projectId: number;
  userRole: UserRole;
  onBack: () => void;
  onLogActivity: () => void;
  token: string;
}

export default function ProjectDetail({
  projectId,
  userRole,
  onBack,
  onLogActivity,
  token,
}: ProjectDetailProps) {
  const [project, setProject] = React.useState<any>(null);
  const [activeTab, setActiveTab] = React.useState<'resumen' | 'convenio' | 'presupuesto' | 'comprobantes' | 'documentos' | 'reporte'>('resumen');
  const [isLoading, setIsLoading] = React.useState(true);

  // Form states for various tabs
  // 1. Physical progress update
  const [physicalVal, setPhysicalVal] = React.useState<number>(0);
  const [statusVal, setStatusVal] = React.useState<string>('');
  
  // 2. Add clause
  const [clauseTitle, setClauseTitle] = React.useState('');
  const [clauseDesc, setClauseDesc] = React.useState('');
  const [clausePriority, setClausePriority] = React.useState('ALTA PRIORIDAD');
  const [clauseCat, setClauseCat] = React.useState('COMPLIANCE');

  // 2b. Add Agreement
  const [agCounterparty, setAgCounterparty] = React.useState('');
  const [agSignedDate, setAgSignedDate] = React.useState('');
  const [agAmount, setAgAmount] = React.useState('');
  const [agDuration, setAgDuration] = React.useState('');

  // 3. Add disbursement
  const [milestoneTitle, setMilestoneTitle] = React.useState('');
  const [disbDate, setDisbDate] = React.useState('');
  const [disbAmount, setDisbAmount] = React.useState('');
  const [disbCond, setDisbCond] = React.useState('');

  // 4. Add budget item
  const [budgetCode, setBudgetCode] = React.useState('');
  const [budgetCat, setBudgetCat] = React.useState('');
  const [budgetSub, setBudgetSub] = React.useState('');
  const [budgetApproved, setBudgetApproved] = React.useState('');

  // 5. Reformulate budget item
  const [refItemId, setRefItemId] = React.useState<number | null>(null);
  const [refVal, setRefVal] = React.useState('');

  // 6. Add Voucher (Compliance)
  const [vBudgetItem, setVBudgetItem] = React.useState('');
  const [vType, setVType] = React.useState('Factura');
  const [vAmount, setVAmount] = React.useState('');
  const [vProvider, setVProvider] = React.useState('');
  const [vDate, setVDate] = React.useState('');
  const [vMilestone, setVMilestone] = React.useState('');
  const [vDesc, setVDesc] = React.useState('');
  const [vFile, setVFile] = React.useState<File | null>(null);
  const [complianceAlert, setComplianceAlert] = React.useState<string | null>(null);

  // 7. Add document
  const [docFile, setDocFile] = React.useState<File | null>(null);

  // 8. AI Report Generator State
  const [reportType, setReportType] = React.useState('Diagnóstico de Cumplimiento y Riesgos');
  const [focusArea, setFocusArea] = React.useState('General');
  const [aiReportOutput, setAiReportOutput] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);

  // Feedback states
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const [generalSuccess, setGeneralSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    loadProjectDetails();
  }, [projectId]);

  const loadProjectDetails = async () => {
    setIsLoading(true);
    setGeneralError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudo cargar el proyecto');
      const data = await res.json();
      setProject(data);
      setPhysicalVal(data.physicalProgress);
      setStatusVal(data.status);
    } catch (err: any) {
      console.error(err);
      setGeneralError('Error al recuperar detalles del servidor Cloud SQL.');
    } finally {
      setIsLoading(false);
    }
  };

  // 1. UPDATE PHYSICAL PROGRESS
  const handleUpdatePhysical = async () => {
    setGeneralError(null);
    setGeneralSuccess(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          physicalProgress: physicalVal,
          status: statusVal,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al actualizar progreso');
      }

      setGeneralSuccess('Progreso y estado actualizados con éxito.');
      onLogActivity();
      loadProjectDetails();
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  // 2. ADD CONTRACT CLAUSE
  const handleAddClause = async (agreementId: number) => {
    setGeneralError(null);
    setGeneralSuccess(null);
    if (!clauseTitle || !clauseDesc) {
      setGeneralError('Debe llenar el título y descripción de la cláusula.');
      return;
    }
    try {
      const res = await fetch(`/api/agreements/${agreementId}/clauses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: clauseTitle,
          description: clauseDesc,
          priority: clausePriority,
          category: clauseCat,
        }),
      });

      if (!res.ok) throw new Error('Error al registrar cláusula.');

      setGeneralSuccess('Cláusula registrada.');
      setClauseTitle('');
      setClauseDesc('');
      onLogActivity();
      loadProjectDetails();
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  // 2b. ADD AGREEMENT
  const handleAddAgreement = async () => {
    setGeneralError(null);
    setGeneralSuccess(null);
    if (!agCounterparty || !agSignedDate || !agAmount || !agDuration) {
      setGeneralError('Llene los campos obligatorios del convenio.');
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/agreements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          counterparty: agCounterparty,
          signedDate: agSignedDate,
          amount: agAmount,
          durationMonths: agDuration,
        }),
      });

      if (!res.ok) {
        const dErr = await res.json();
        throw new Error(dErr.error || 'Error al registrar convenio');
      }

      setGeneralSuccess('Nuevo convenio registrado.');
      setAgCounterparty('');
      setAgSignedDate('');
      setAgAmount('');
      setAgDuration('');
      onLogActivity();
      loadProjectDetails();
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  // 3. ADD DISBURSEMENT MILESTONE
  const handleAddDisbursement = async (agreementId: number) => {
    setGeneralError(null);
    setGeneralSuccess(null);
    if (!milestoneTitle || !disbDate || !disbAmount) {
      setGeneralError('Título, Fecha Estimada y Monto son requeridos.');
      return;
    }
    try {
      const res = await fetch(`/api/agreements/${agreementId}/disbursements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          milestoneTitle,
          estimatedDate: disbDate,
          amount: parseFloat(disbAmount),
          condition: disbCond,
        }),
      });

      if (!res.ok) throw new Error('Error al agendar desembolso.');

      setGeneralSuccess('Desembolso programado agregado.');
      setMilestoneTitle('');
      setDisbDate('');
      setDisbAmount('');
      setDisbCond('');
      onLogActivity();
      loadProjectDetails();
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  // 4. CHANGE DISBURSEMENT STATUS (E.G. PAGADO)
  const handleToggleDisbStatus = async (disbId: number, currentStatus: string) => {
    setGeneralError(null);
    const nextStatus = currentStatus === 'PENDIENTE' ? 'PAGADO' : 'PENDIENTE';
    try {
      const res = await fetch(`/api/disbursements/${disbId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) throw new Error('Error al modificar estado del desembolso.');
      onLogActivity();
      loadProjectDetails();
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  // 5. ADD BUDGET LINE ITEM
  const handleAddBudgetItem = async () => {
    setGeneralError(null);
    setGeneralSuccess(null);
    if (!budgetCode || !budgetCat || !budgetSub || !budgetApproved) {
      setGeneralError('Todos los campos del presupuesto son requeridos.');
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/budget-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: budgetCode,
          category: budgetCat,
          subcategory: budgetSub,
          approved: parseFloat(budgetApproved),
        }),
      });

      if (!res.ok) throw new Error('Error al registrar partida presupuestaria.');

      setGeneralSuccess('Partida presupuestaria agregada con éxito.');
      setBudgetCode('');
      setBudgetCat('');
      setBudgetSub('');
      setBudgetApproved('');
      onLogActivity();
      loadProjectDetails();
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  // 6. REFORMULATE BUDGET LINE ITEM (RBAC: DIRECTOR/MANAGER)
  const handleReformulate = async (itemId: number) => {
    setGeneralError(null);
    setGeneralSuccess(null);
    if (!refVal) {
      setGeneralError('Ingrese la nueva asignación reformulada.');
      return;
    }
    try {
      const res = await fetch(`/api/budget-items/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reformulated: parseFloat(refVal) }),
      });

      if (!res.ok) {
        const errD = await res.json();
        throw new Error(errD.error || 'Error al reformular partida.');
      }

      setGeneralSuccess('Partida reformulada con éxito.');
      setRefItemId(null);
      setRefVal('');
      onLogActivity();
      loadProjectDetails();
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  // 7. UPLOAD COMPLIANCE VOUCHER (CARGA CON COMPLIANCE EN CALIENTE)
  const handleAddVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setGeneralSuccess(null);
    setComplianceAlert(null);

    if (!vBudgetItem || !vAmount || !vProvider || !vDate || !vFile) {
      setGeneralError('Faltan datos obligatorios para el comprobante.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('budgetLineId', vBudgetItem);
      formData.append('type', vType);
      formData.append('amount', vAmount);
      formData.append('provider', vProvider);
      formData.append('issueDate', vDate);
      formData.append('milestone', vMilestone);
      formData.append('description', vDesc);
      formData.append('file', vFile);

      const res = await fetch(`/api/projects/${projectId}/receiptsVouchers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) throw new Error('Error al guardar comprobante.');
      const data = await res.json();

      setGeneralSuccess('Comprobante cargado de forma exitosa.');
      if (data.complianceAlert) {
        setComplianceAlert(data.complianceAlert);
      }

      // Reset form
      setVBudgetItem('');
      setVAmount('');
      setVProvider('');
      setVDate('');
      setVMilestone('');
      setVDesc('');
      setVFile(null);
      onLogActivity();
      loadProjectDetails();
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  // 8. VERIFY VOUCHER (RBAC: FINANCE / DIRECTOR)
  const handleVerifyVoucher = async (voucherId: number, currentStatus: boolean) => {
    setGeneralError(null);
    try {
      const res = await fetch(`/api/receiptsVouchers/${voucherId}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isVerified: !currentStatus }),
      });

      if (!res.ok) {
        const dataErr = await res.json();
        throw new Error(dataErr.error || 'Error al verificar comprobante.');
      }

      onLogActivity();
      loadProjectDetails();
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  // 9. UPLOAD REPOSITORY DOCUMENT
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setGeneralSuccess(null);
    if (!docFile) {
      setGeneralError('Seleccione un archivo para cargar.');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', docFile);

      const res = await fetch(`/api/projects/${projectId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) throw new Error('Error al registrar documento');

      setGeneralSuccess('Documento registrado en el repositorio digital.');
      setDocFile(null);
      onLogActivity();
      loadProjectDetails();
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  // 10. GENERATE AI EXECUTIVE SUMMARY WITH GEMINI
  const handleGenerateAIReport = async () => {
    setAiLoading(true);
    setGeneralError(null);
    setAiReportOutput(null);
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId,
          reportType,
          focusArea,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.demoMarkdown) {
          setAiReportOutput(data.demoMarkdown);
          setGeneralError(data.error); // Warning about missing API key
        } else {
          throw new Error(data.error || 'Fallo de IA.');
        }
      } else {
        setAiReportOutput(data.report);
      }
    } catch (err: any) {
      setGeneralError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  // DELETE PROJECT (DIRECTOR ONLY)
  const handleDeleteProject = async () => {
    if (!confirm('¿Está absolutamente seguro de que desea eliminar permanentemente este proyecto y todos sus datos relacionados (convenios, partidas, comprobantes)?')) {
      return;
    }
    setGeneralError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const dErr = await res.json();
        throw new Error(dErr.error || 'No se pudo eliminar el proyecto');
      }
      onBack();
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <PageHeaderSkeleton />
        <TableSkeleton />
      </div>
    );
  }

  const canDeleteProject = userRole === 'DIRECTOR';
  const isEditable = hasPermission(userRole, 'canEditProject');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5 select-none">
      
      {/* Upper Navigation & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-slate-500 hover:text-[#008fa0] text-xs font-sans font-bold cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Portafolio</span>
        </button>

        {canDeleteProject && (
          <button
            onClick={handleDeleteProject}
            className="text-red-600 hover:bg-red-50 border border-red-200 text-xs font-bold px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Eliminar Proyecto</span>
          </button>
        )}
      </div>

      {/* Hero Banner Section */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono font-black bg-[#e0f2f4] text-[#008fa0] px-2 py-0.5 rounded">
              {project.code}
            </span>
            <span className="text-xs font-mono text-slate-400">Riesgo Institucional: {project.riskLevel}</span>
          </div>
          <h2 className="text-xl font-display font-bold text-[#00313b]">{project.name}</h2>
          <p className="text-xs text-slate-400 font-sans">
            Donante Principal: <span className="font-bold text-[#00313b]">{project.donor}</span>
          </p>
        </div>

        <div className="flex items-center space-x-1.5 bg-slate-50 p-2.5 rounded-md border border-slate-200 font-mono text-xs text-[#00313b]">
          <DollarSign className="w-4 h-4 text-emerald-600" />
          <span>Presupuesto total aprobado:</span>
          <span className="font-bold">${project.approvedBudget.toLocaleString()} USD</span>
        </div>
      </div>

      {/* Form Error & Success Status */}
      {generalError && (
        <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-sans rounded-md flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{generalError}</span>
        </div>
      )}

      {generalSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-sans rounded-md flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{generalSuccess}</span>
        </div>
      )}

      {complianceAlert && (
        <div className="p-4 bg-amber-50 border-l-4 border-amber-500 text-amber-800 text-xs font-sans rounded-r-md space-y-1">
          <div className="font-bold flex items-center space-x-1.5">
            <AlertOctagon className="w-4 h-4 text-amber-600" />
            <span>Alerta de Compliance Presupuestaria</span>
          </div>
          <p>{complianceAlert}</p>
        </div>
      )}

      {/* Tabs Menu */}
      <div className="border-b border-slate-200 flex flex-wrap gap-1">
        {[
          { id: 'resumen', label: 'Resumen General', icon: Layers },
          { id: 'convenio', label: 'Convenios y Desembolsos', icon: FileCheck2 },
          { id: 'presupuesto', label: 'Control Presupuestario', icon: FileSpreadsheet },
          { id: 'comprobantes', label: 'Comprobantes (Compliance)', icon: DollarSign },
          { id: 'documentos', label: 'Expediente Digital', icon: FileText },
          { id: 'reporte', label: 'Asistente de Reportes AI', icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setGeneralError(null);
                setGeneralSuccess(null);
                setComplianceAlert(null);
              }}
              className={`flex items-center space-x-2 py-2 px-3 font-sans text-xs font-semibold border-b-2 cursor-pointer transition-all ${
                isActive
                  ? 'border-[#008fa0] text-[#008fa0]'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENTS */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
        
        {/* TAB 1: RESUMEN GENERAL */}
        {activeTab === 'resumen' && (
          <TabResumen 
            project={project}
            isEditable={isEditable}
            physicalVal={physicalVal}
            setPhysicalVal={setPhysicalVal}
            statusVal={statusVal}
            setStatusVal={setStatusVal}
            handleUpdatePhysical={handleUpdatePhysical}
          />
        )}

        {/* TAB 2: CONVENIOS & DISBURSEMENTS */}
        {activeTab === 'convenio' && (
          <TabConvenio 
            project={project}
            isEditable={isEditable}
            milestoneTitle={milestoneTitle}
            setMilestoneTitle={setMilestoneTitle}
            disbDate={disbDate}
            setDisbDate={setDisbDate}
            disbAmount={disbAmount}
            setDisbAmount={setDisbAmount}
            disbCond={disbCond}
            setDisbCond={setDisbCond}
            handleAddDisbursement={handleAddDisbursement}
            handleToggleDisbStatus={handleToggleDisbStatus}
            clauseTitle={clauseTitle}
            setClauseTitle={setClauseTitle}
            clauseDesc={clauseDesc}
            setClauseDesc={setClauseDesc}
            clausePriority={clausePriority}
            setClausePriority={setClausePriority}
            clauseCat={clauseCat}
            setClauseCat={setClauseCat}
            handleAddClause={handleAddClause}
            agCounterparty={agCounterparty}
            setAgCounterparty={setAgCounterparty}
            agSignedDate={agSignedDate}
            setAgSignedDate={setAgSignedDate}
            agAmount={agAmount}
            setAgAmount={setAgAmount}
            agDuration={agDuration}
            setAgDuration={setAgDuration}
            handleAddAgreement={handleAddAgreement}
          />
        )}

        {/* TAB 3: CONTROL PRESUPUESTARIO */}
        {activeTab === 'presupuesto' && (
          <TabPresupuesto 
            project={project}
            isEditable={isEditable}
            budgetCode={budgetCode}
            setBudgetCode={setBudgetCode}
            budgetCat={budgetCat}
            setBudgetCat={setBudgetCat}
            budgetSub={budgetSub}
            setBudgetSub={setBudgetSub}
            budgetApproved={budgetApproved}
            setBudgetApproved={setBudgetApproved}
            handleAddBudgetItem={handleAddBudgetItem}
            refItemId={refItemId}
            setRefItemId={setRefItemId}
            refVal={refVal}
            setRefVal={setRefVal}
            handleReformulate={handleReformulate}
          />
        )}

        {/* TAB 4: COMPROBANTES DE COMPLIANCE */}
        {activeTab === 'comprobantes' && (
          <TabComprobantes 
            project={project}
            userRole={userRole}
            vBudgetItem={vBudgetItem}
            setVBudgetItem={setVBudgetItem}
            vType={vType}
            setVType={setVType}
            vAmount={vAmount}
            setVAmount={setVAmount}
            vProvider={vProvider}
            setVProvider={setVProvider}
            vDate={vDate}
            setVDate={setVDate}
            vMilestone={vMilestone}
            setVMilestone={setVMilestone}
            vFileName={vFile ? vFile.name : ''}
            setVFileName={(name: string) => {}}
            vFile={vFile}
            setVFile={setVFile}
            vDesc={vDesc}
            setVDesc={setVDesc}
            handleAddVoucher={handleAddVoucher}
            handleVerifyVoucher={handleVerifyVoucher}
          />
        )}

        {/* TAB 5: DOCUMENTOS REPOSITORIO */}
        {activeTab === 'documentos' && (
          <TabDocumentos 
            project={project}
            userRole={userRole}
            docName={docFile ? docFile.name : ''}
            setDocName={(val: string) => {}}
            docFile={docFile}
            setDocFile={setDocFile}
            handleAddDocument={handleAddDocument}
          />
        )}

        {/* TAB 6: AI REPORTS WITH GEMINI */}
        {activeTab === 'reporte' && (
          <TabReporteAI 
            reportType={reportType}
            setReportType={setReportType}
            focusArea={focusArea}
            setFocusArea={setFocusArea}
            handleGenerateAIReport={handleGenerateAIReport}
            aiLoading={aiLoading}
            aiReportOutput={aiReportOutput}
          />
        )}

      </div>

    </div>
  );
}
