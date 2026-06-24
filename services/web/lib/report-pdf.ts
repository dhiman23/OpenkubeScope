// Premium PDF Report Generator for KubeScope
// Produces a professional security audit PDF similar to Wiz / Aqua Security reports

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ReportData, FlatRBACRow } from './report-generator'

// ============================================
// COLOR PALETTE
// ============================================

const COLORS = {
  primary: [15, 23, 42] as [number, number, number],        // slate-900
  primaryLight: [30, 41, 59] as [number, number, number],   // slate-800
  accent: [59, 130, 246] as [number, number, number],       // blue-500
  accentLight: [219, 234, 254] as [number, number, number], // blue-100
  critical: [220, 38, 38] as [number, number, number],      // red-600
  criticalBg: [254, 226, 226] as [number, number, number],  // red-100
  high: [234, 88, 12] as [number, number, number],          // orange-600
  highBg: [255, 237, 213] as [number, number, number],      // orange-100
  medium: [202, 138, 4] as [number, number, number],        // yellow-600
  mediumBg: [254, 249, 195] as [number, number, number],    // yellow-100
  low: [22, 163, 74] as [number, number, number],           // green-600
  lowBg: [220, 252, 231] as [number, number, number],       // green-100
  text: [15, 23, 42] as [number, number, number],           // slate-900
  textSecondary: [100, 116, 139] as [number, number, number], // slate-500
  border: [226, 232, 240] as [number, number, number],      // slate-200
  white: [255, 255, 255] as [number, number, number],
  bgLight: [248, 250, 252] as [number, number, number],     // slate-50
  watermark: [200, 210, 225] as [number, number, number],
}

const SEVERITY_COLORS = {
  critical: { text: COLORS.critical, bg: COLORS.criticalBg },
  high: { text: COLORS.high, bg: COLORS.highBg },
  medium: { text: COLORS.medium, bg: COLORS.mediumBg },
  low: { text: COLORS.low, bg: COLORS.lowBg },
}

// ============================================
// PDF GENERATION
// ============================================

export function generatePDFReport(reportData: ReportData): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20

  // Track total pages for footer
  let currentPage = 1

  // --- COVER PAGE ---
  drawCoverPage(doc, reportData, pageWidth, pageHeight)
  addWatermark(doc, pageWidth, pageHeight)

  // --- EXECUTIVE SUMMARY ---
  doc.addPage()
  currentPage++
  let y = drawPageHeader(doc, reportData, pageWidth, margin)
  y = drawExecutiveSummary(doc, reportData, y, margin, pageWidth)
  addWatermark(doc, pageWidth, pageHeight)

  // --- RISK SUMMARY DASHBOARD ---
  doc.addPage()
  currentPage++
  y = drawPageHeader(doc, reportData, pageWidth, margin)
  y = drawRiskDashboard(doc, reportData, y, margin, pageWidth)
  addWatermark(doc, pageWidth, pageHeight)

  // --- TOP FINDINGS ---
  if (reportData.findings.length > 0) {
    doc.addPage()
    currentPage++
    y = drawPageHeader(doc, reportData, pageWidth, margin)
    y = drawTopFindings(doc, reportData, y, margin, pageWidth, pageHeight)
    addWatermark(doc, pageWidth, pageHeight)
  }

  // --- RBAC TABLE ---
  if (reportData.rbac_rows.length > 0) {
    doc.addPage()
    currentPage++
    y = drawPageHeader(doc, reportData, pageWidth, margin)
    drawRBACTable(doc, reportData.rbac_rows, y, margin, pageWidth, pageHeight)
    addWatermark(doc, pageWidth, pageHeight)
  }

  // --- RECOMMENDATIONS ---
  if (reportData.compliance?.recommendations || reportData.findings.length > 0) {
    doc.addPage()
    currentPage++
    y = drawPageHeader(doc, reportData, pageWidth, margin)
    drawRecommendations(doc, reportData, y, margin, pageWidth)
    addWatermark(doc, pageWidth, pageHeight)
  }

  // Add page numbers to all pages
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawPageFooter(doc, i, totalPages, pageWidth, pageHeight, margin)
    // Add watermark to any auto-added pages (from autoTable overflow)
    if (i > currentPage) {
      addWatermark(doc, pageWidth, pageHeight)
    }
  }

  return doc
}

// ============================================
// COVER PAGE
// ============================================

function drawCoverPage(doc: jsPDF, data: ReportData, pw: number, ph: number) {
  // Full-page dark background
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, pw, ph, 'F')

  // Accent bar at top
  doc.setFillColor(...COLORS.accent)
  doc.rect(0, 0, pw, 6, 'F')

  // KubeScope logo area
  doc.setFillColor(...COLORS.accent)
  doc.roundedRect(20, 40, 44, 44, 4, 4, 'F')
  doc.setTextColor(...COLORS.white)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('K', 35, 60)
  doc.setFontSize(11)
  doc.text('SCOPE', 35, 72)

  // Title
  doc.setTextColor(...COLORS.white)
  doc.setFontSize(32)
  doc.setFont('helvetica', 'bold')
  doc.text('RBAC Security Report', 20, 115)

  // Report type subtitle
  doc.setFontSize(16)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.accentLight)
  const typeLabels: Record<string, string> = {
    COMPLIANCE: 'Compliance Report',
    RISK_ASSESSMENT: 'Risk Assessment',
    RBAC_AUDIT: 'RBAC Audit',
    TREND_ANALYSIS: 'Trend Analysis',
  }
  doc.text(typeLabels[data.report_type] || data.report_type, 20, 128)

  // Divider
  doc.setDrawColor(...COLORS.accent)
  doc.setLineWidth(0.5)
  doc.line(20, 140, pw - 20, 140)

  // Metadata
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 190, 210)

  let y = 158
  const labelX = 20
  const valueX = 55

  doc.setFont('helvetica', 'bold')
  doc.text('Clusters:', labelX, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.white)
  doc.text(data.clusters.join(', '), valueX, y)

  y += 12
  doc.setTextColor(180, 190, 210)
  doc.setFont('helvetica', 'bold')
  doc.text('Workspace:', labelX, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.white)
  doc.text(data.workspace_name, valueX, y)

  y += 12
  doc.setTextColor(180, 190, 210)
  doc.setFont('helvetica', 'bold')
  doc.text('Generated:', labelX, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.white)
  doc.text(new Date(data.generated_at).toLocaleString(), valueX, y)

  // Risk summary boxes on cover
  y = ph - 100
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.white)
  doc.text('Risk Summary', 20, y)
  y += 12

  const boxWidth = (pw - 60) / 4
  const severities = [
    { label: 'Critical', count: data.risks.critical, color: COLORS.critical },
    { label: 'High', count: data.risks.high, color: COLORS.high },
    { label: 'Medium', count: data.risks.medium, color: COLORS.medium },
    { label: 'Low', count: data.risks.low, color: COLORS.low },
  ]

  severities.forEach((sev, i) => {
    const x = 20 + i * (boxWidth + 7)
    // Box background
    doc.setFillColor(...COLORS.primaryLight)
    doc.roundedRect(x, y, boxWidth, 35, 3, 3, 'F')
    // Severity color bar
    doc.setFillColor(...sev.color)
    doc.rect(x, y, boxWidth, 4, 'F')
    // Count
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.white)
    doc.text(String(sev.count), x + boxWidth / 2, y + 20, { align: 'center' })
    // Label
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 190, 210)
    doc.text(sev.label, x + boxWidth / 2, y + 29, { align: 'center' })
  })

  // Bottom accent bar
  doc.setFillColor(...COLORS.accent)
  doc.rect(0, ph - 6, pw, 6, 'F')
}

// ============================================
// PAGE HEADER / FOOTER
// ============================================

function drawPageHeader(doc: jsPDF, data: ReportData, pw: number, margin: number): number {
  // Header bar
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, pw, 18, 'F')
  doc.setFillColor(...COLORS.accent)
  doc.rect(0, 18, pw, 1.5, 'F')

  doc.setTextColor(...COLORS.white)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('KubeScope RBAC Security Report', margin, 12)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(data.clusters.join(' | '), pw - margin, 12, { align: 'right' })

  return 30 // return y position after header
}

function drawPageFooter(doc: jsPDF, page: number, total: number, pw: number, ph: number, margin: number) {
  // Skip footer on cover page
  if (page === 1) return

  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.3)
  doc.line(margin, ph - 15, pw - margin, ph - 15)

  doc.setTextColor(...COLORS.textSecondary)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('Generated by KubeScope  •  https://kubescope.dev', margin, ph - 9)
  doc.text(`Page ${page} of ${total}`, pw - margin, ph - 9, { align: 'right' })
}

// ============================================
// WATERMARK
// ============================================

function addWatermark(doc: jsPDF, pw: number, ph: number) {
  doc.saveGraphicsState()
  const gState = new (doc as any).GState({ opacity: 0.04 })
  doc.setGState(gState)
  doc.setTextColor(...COLORS.watermark)
  doc.setFontSize(48)
  doc.setFont('helvetica', 'bold')

  // Diagonal watermark
  const centerX = pw / 2
  const centerY = ph / 2

  // Rotate text diagonally
  const angle = -35
  const rad = (angle * Math.PI) / 180

  doc.text('KubeScope Security Report', centerX, centerY, {
    align: 'center',
    angle: angle,
  })

  doc.restoreGraphicsState()
}

// ============================================
// EXECUTIVE SUMMARY
// ============================================

function drawExecutiveSummary(doc: jsPDF, data: ReportData, y: number, margin: number, pw: number): number {
  const contentWidth = pw - margin * 2

  // Section title
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.text)
  doc.text('Executive Summary', margin, y)
  y += 4

  doc.setFillColor(...COLORS.accent)
  doc.rect(margin, y, 40, 1.5, 'F')
  y += 12

  // Summary paragraph
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.textSecondary)

  const totalFindings = data.risks.critical + data.risks.high + data.risks.medium + data.risks.low
  const summaryText = `This report analyzes the RBAC configuration across ${data.clusters.length} cluster(s): ${data.clusters.join(', ')}. ` +
    `A total of ${data.summary.subjects} subjects, ${data.summary.roles} roles, and ${data.summary.bindings} bindings were evaluated. ` +
    `The analysis identified ${totalFindings} security findings, including ${data.risks.critical} critical and ${data.risks.high} high-severity issues ` +
    `that require immediate attention.`

  const lines = doc.splitTextToSize(summaryText, contentWidth)
  doc.text(lines, margin, y)
  y += lines.length * 5 + 10

  // Summary stats boxes
  const boxW = (contentWidth - 15) / 4
  const stats = [
    { label: 'Subjects', value: String(data.summary.subjects), color: COLORS.accent },
    { label: 'Roles', value: String(data.summary.roles), color: COLORS.accent },
    { label: 'Bindings', value: String(data.summary.bindings), color: COLORS.accent },
    { label: 'Findings', value: String(totalFindings), color: data.risks.critical > 0 ? COLORS.critical : COLORS.accent },
  ]

  stats.forEach((stat, i) => {
    const x = margin + i * (boxW + 5)

    doc.setFillColor(...COLORS.bgLight)
    doc.roundedRect(x, y, boxW, 28, 2, 2, 'F')

    doc.setDrawColor(...stat.color)
    doc.setLineWidth(0.5)
    doc.line(x, y, x, y + 28)

    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...stat.color)
    doc.text(stat.value, x + 8, y + 14)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.textSecondary)
    doc.text(stat.label, x + 8, y + 22)
  })

  y += 40

  // Clusters analyzed
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.text)
  doc.text('Clusters Analyzed', margin, y)
  y += 8

  for (const cluster of data.clusters) {
    doc.setFillColor(...COLORS.accentLight)
    doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.text)
    doc.text(`• ${cluster}`, margin + 5, y + 7)
    y += 13
  }

  return y + 5
}

// ============================================
// RISK DASHBOARD
// ============================================

function drawRiskDashboard(doc: jsPDF, data: ReportData, y: number, margin: number, pw: number): number {
  const contentWidth = pw - margin * 2

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.text)
  doc.text('Risk Summary Dashboard', margin, y)
  y += 4
  doc.setFillColor(...COLORS.accent)
  doc.rect(margin, y, 40, 1.5, 'F')
  y += 15

  // Severity cards
  const cardW = (contentWidth - 15) / 4
  const severities = [
    { label: 'Critical', count: data.risks.critical, colors: SEVERITY_COLORS.critical },
    { label: 'High', count: data.risks.high, colors: SEVERITY_COLORS.high },
    { label: 'Medium', count: data.risks.medium, colors: SEVERITY_COLORS.medium },
    { label: 'Low', count: data.risks.low, colors: SEVERITY_COLORS.low },
  ]

  severities.forEach((sev, i) => {
    const x = margin + i * (cardW + 5)

    // Card background
    doc.setFillColor(...sev.colors.bg)
    doc.roundedRect(x, y, cardW, 40, 3, 3, 'F')

    // Top color bar
    doc.setFillColor(...sev.colors.text)
    doc.roundedRect(x, y, cardW, 5, 3, 3, 'F')
    doc.setFillColor(...sev.colors.bg)
    doc.rect(x, y + 3, cardW, 4, 'F')

    // Count
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...sev.colors.text)
    doc.text(String(sev.count), x + cardW / 2, y + 24, { align: 'center' })

    // Label
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(sev.label, x + cardW / 2, y + 34, { align: 'center' })
  })

  y += 55

  // Severity distribution bar
  const total = data.risks.critical + data.risks.high + data.risks.medium + data.risks.low
  if (total > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.text)
    doc.text('Severity Distribution', margin, y)
    y += 8

    const barHeight = 10
    let barX = margin

    const segments = [
      { count: data.risks.critical, color: COLORS.critical },
      { count: data.risks.high, color: COLORS.high },
      { count: data.risks.medium, color: COLORS.medium },
      { count: data.risks.low, color: COLORS.low },
    ]

    for (const seg of segments) {
      if (seg.count === 0) continue
      const segW = (seg.count / total) * contentWidth
      doc.setFillColor(...seg.color)
      doc.rect(barX, y, segW, barHeight, 'F')
      barX += segW
    }

    y += barHeight + 5

    // Legend
    segments.forEach((seg, i) => {
      const legendX = margin + i * 42
      doc.setFillColor(...seg.color)
      doc.rect(legendX, y, 5, 5, 'F')
      doc.setFontSize(7)
      doc.setTextColor(...COLORS.textSecondary)
      const labels = ['Critical', 'High', 'Medium', 'Low']
      const counts = [data.risks.critical, data.risks.high, data.risks.medium, data.risks.low]
      doc.text(`${labels[i]} (${counts[i]})`, legendX + 7, y + 4)
    })

    y += 15
  }

  // Findings by category
  if (data.risk_assessment?.findings_by_category) {
    y += 5
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.text)
    doc.text('Findings by Category', margin, y)
    y += 8

    for (const [category, findings] of Object.entries(data.risk_assessment.findings_by_category)) {
      doc.setFillColor(...COLORS.bgLight)
      doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F')

      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.text)
      doc.text(category.replace(/_/g, ' '), margin + 5, y + 7)

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.textSecondary)
      doc.text(`${findings.length} findings`, pw - margin - 5, y + 7, { align: 'right' })

      y += 13
    }
  }

  return y
}

// ============================================
// TOP FINDINGS
// ============================================

function drawTopFindings(doc: jsPDF, data: ReportData, y: number, margin: number, pw: number, ph: number): number {
  const contentWidth = pw - margin * 2

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.text)
  doc.text('Top Security Findings', margin, y)
  y += 4
  doc.setFillColor(...COLORS.accent)
  doc.rect(margin, y, 40, 1.5, 'F')
  y += 12

  const topFindings = data.findings.slice(0, 10)

  for (const finding of topFindings) {
    // Check page overflow
    if (y > ph - 50) {
      doc.addPage()
      y = drawPageHeader(doc, data, pw, margin)
    }

    const sevColors = SEVERITY_COLORS[finding.severity as keyof typeof SEVERITY_COLORS]

    // Finding card
    doc.setFillColor(...COLORS.bgLight)
    doc.roundedRect(margin, y, contentWidth, 32, 2, 2, 'F')

    // Severity badge
    doc.setFillColor(...sevColors.bg)
    doc.roundedRect(margin + 3, y + 3, 18, 7, 1, 1, 'F')
    doc.setFontSize(6)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...sevColors.text)
    doc.text(finding.severity.toUpperCase(), margin + 12, y + 8, { align: 'center' })

    // Title
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.text)
    const titleLines = doc.splitTextToSize(finding.title, contentWidth - 30)
    doc.text(titleLines[0], margin + 25, y + 9)

    // Subject and role
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.textSecondary)
    doc.text(`Subject: ${finding.subject}  •  Role: ${finding.role}  •  Namespace: ${finding.namespace}`, margin + 5, y + 19)

    // Description
    const descLines = doc.splitTextToSize(finding.description, contentWidth - 10)
    doc.setFontSize(7)
    doc.text(descLines[0], margin + 5, y + 27)

    y += 36
  }

  return y
}

// ============================================
// RBAC TABLE
// ============================================

function drawRBACTable(doc: jsPDF, rows: FlatRBACRow[], y: number, margin: number, pw: number, ph: number) {
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.text)
  doc.text('RBAC Access Matrix', margin, y)
  y += 4
  doc.setFillColor(...COLORS.accent)
  doc.rect(margin, y, 40, 1.5, 'F')
  y += 10

  // Limit rows for PDF readability
  const displayRows = rows.slice(0, 100)

  autoTable(doc, {
    startY: y,
    head: [['Subject', 'Type', 'Namespace', 'Role', 'Resource', 'Verbs', 'Risk']],
    body: displayRows.map(r => [r.subject, r.type, r.namespace, r.role, r.resource, r.verbs, r.risk]),
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 7,
      cellPadding: 2,
      lineColor: COLORS.border,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: COLORS.bgLight,
    },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 18 },
      2: { cellWidth: 22 },
      3: { cellWidth: 28 },
      4: { cellWidth: 25 },
      5: { cellWidth: 30 },
      6: { cellWidth: 16 },
    },
    didParseCell(data) {
      // Color-code risk column
      if (data.section === 'body' && data.column.index === 6) {
        const risk = String(data.cell.raw).toLowerCase()
        if (risk === 'critical') {
          data.cell.styles.textColor = COLORS.critical
          data.cell.styles.fontStyle = 'bold'
        } else if (risk === 'high') {
          data.cell.styles.textColor = COLORS.high
          data.cell.styles.fontStyle = 'bold'
        } else if (risk === 'medium') {
          data.cell.styles.textColor = COLORS.medium
        } else if (risk === 'low') {
          data.cell.styles.textColor = COLORS.low
        }
      }
    },
  })

  if (rows.length > 100) {
    const finalY = (doc as any).lastAutoTable?.finalY || y + 20
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...COLORS.textSecondary)
    doc.text(`Showing 100 of ${rows.length} total rows. Export as CSV for the complete dataset.`, margin, finalY + 8)
  }
}

// ============================================
// RECOMMENDATIONS
// ============================================

function drawRecommendations(doc: jsPDF, data: ReportData, y: number, margin: number, pw: number) {
  const contentWidth = pw - margin * 2

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.text)
  doc.text('Security Recommendations', margin, y)
  y += 4
  doc.setFillColor(...COLORS.accent)
  doc.rect(margin, y, 40, 1.5, 'F')
  y += 12

  const recommendations = data.compliance?.recommendations || generateDefaultRecommendations(data)

  recommendations.forEach((rec, i) => {
    // Numbered card
    doc.setFillColor(...COLORS.bgLight)
    doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F')

    // Number circle
    doc.setFillColor(...COLORS.accent)
    doc.circle(margin + 8, y + 9, 5, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.white)
    doc.text(String(i + 1), margin + 8, y + 11, { align: 'center' })

    // Recommendation text
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.text)
    const lines = doc.splitTextToSize(rec, contentWidth - 25)
    doc.text(lines, margin + 17, y + 8)

    y += Math.max(18, lines.length * 5 + 8) + 3
  })
}

function generateDefaultRecommendations(data: ReportData): string[] {
  const recs: string[] = []
  if (data.risks.critical > 0) {
    recs.push(`Remediate ${data.risks.critical} critical finding(s) immediately. These represent the highest risk to your cluster security posture.`)
  }
  if (data.risks.high > 0) {
    recs.push(`Address ${data.risks.high} high-severity finding(s) within your next maintenance window.`)
  }
  recs.push('Implement regular RBAC auditing as part of your security operations workflow.')
  recs.push('Apply the principle of least privilege by replacing wildcard (*) permissions with explicit resource and verb grants.')
  recs.push('Use namespace-scoped Roles instead of ClusterRoles wherever cluster-wide access is not strictly required.')
  return recs
}

// ============================================
// PUBLIC DOWNLOAD HELPER
// ============================================

export function downloadPDFReport(reportData: ReportData, fileName: string) {
  const doc = generatePDFReport(reportData)
  doc.save(fileName)
}
