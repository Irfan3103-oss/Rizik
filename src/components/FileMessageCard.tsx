import { Download, FileArchive, FileSpreadsheet, FileText } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface FileMessageCardProps {
  fileUrl: string;
  fileName: string;
  fileSize?: number | null;
  fileMime?: string | null;
  isMine: boolean;
}

function formatBytes(bytes: number | null | undefined, formatNumber: (v: string | number) => string) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${formatNumber(bytes)} B`;
  if (bytes < 1024 * 1024) return `${formatNumber((bytes / 1024).toFixed(1))} KB`;
  return `${formatNumber((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

function getFileBadge(fileName: string, mime?: string | null) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf' || mime?.includes('pdf')) {
    return { ext: 'PDF', icon: FileText, color: 'bg-red-500 text-white' };
  }
  if (['xls', 'xlsx', 'csv'].includes(ext) || mime?.includes('excel') || mime?.includes('csv')) {
    return { ext: ext.toUpperCase() || 'XLS', icon: FileSpreadsheet, color: 'bg-emerald-600 text-white' };
  }
  if (['zip', 'rar', '7z'].includes(ext) || mime?.includes('zip')) {
    return { ext: ext.toUpperCase() || 'ZIP', icon: FileArchive, color: 'bg-amber-600 text-white' };
  }
  if (['doc', 'docx'].includes(ext) || mime?.includes('word')) {
    return { ext: ext.toUpperCase() || 'DOC', icon: FileText, color: 'bg-blue-600 text-white' };
  }
  return { ext: (ext || 'FILE').toUpperCase().slice(0, 4), icon: FileText, color: 'bg-slate-600 text-white' };
}

export function FileMessageCard({
  fileUrl,
  fileName,
  fileSize,
  fileMime,
  isMine,
}: FileMessageCardProps) {
  const { t, formatNumber } = useI18n();
  const badge = getFileBadge(fileName, fileMime);
  const Icon = badge.icon;
  const formattedSize = formatBytes(fileSize, formatNumber);

  return (
    <div className="w-full max-w-[240px] sm:w-64 space-y-2">
      <div
        className={`p-2.5 rounded-xl flex items-center gap-2.5 ${
          isMine
            ? 'bg-black/15'
            : 'bg-[var(--bg-subtle)] border border-[var(--border-subtle)]'
        }`}
      >
        <div
          className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 ${badge.color}`}
        >
          <Icon className="w-4 h-4" />
          <span className="text-[8px] font-extrabold leading-none mt-0.5">{badge.ext}</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold truncate" title={fileName}>
            {fileName}
          </p>
          <p
            className={`text-[11px] tabular-nums ${
              isMine ? 'opacity-80' : 'text-[var(--text-muted)]'
            }`}
          >
            {formattedSize ? `${formattedSize} · ` : ''}
            {t('file.documentLabel')}
          </p>
        </div>
      </div>

      <a
        href={fileUrl}
        download={fileName}
        target="_blank"
        rel="noopener noreferrer"
        className={`w-full min-h-[34px] px-3 py-1.5 rounded-xl text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
          isMine
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)]'
        }`}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{t('file.downloadBtn')}</span>
      </a>
    </div>
  );
}
