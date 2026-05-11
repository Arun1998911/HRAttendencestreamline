import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X } from "lucide-react";

type UploadState = "idle" | "uploading" | "done" | "error";

interface Props {
  label: string;
  description: string;
  onUpload: (file: File) => Promise<{ rows_imported: number }>;
}

export default function UploadZone({ label, description, onUpload }: Props) {
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [rowsImported, setRowsImported] = useState<number | null>(null);
  const [error, setError] = useState("");

  const handleFile = useCallback(
    async (f: File) => {
      setFile(f);
      setState("uploading");
      setError("");
      try {
        const result = await onUpload(f);
        setRowsImported(result.rows_imported);
        setState("done");
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : "Upload failed";
        setError(msg);
        setState("error");
      }
    },
    [onUpload]
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) handleFile(accepted[0]);
    },
    [handleFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    disabled: state === "uploading",
  });

  const reset = () => {
    setFile(null);
    setState("idle");
    setRowsImported(null);
    setError("");
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3">
        <h3 className="font-semibold text-gray-800">{label}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>

      {state === "idle" && (
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
            isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
          }`}
        >
          <input {...getInputProps()} />
          <FileSpreadsheet size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">
            {isDragActive ? "Drop your Excel file here" : "Drag & drop or click to upload"}
          </p>
          <p className="text-xs text-gray-400 mt-1">.xlsx or .xls</p>
        </div>
      )}

      {state === "uploading" && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 py-8">
          <Loader2 size={24} className="animate-spin text-blue-500" />
          <p className="text-sm text-gray-600">Uploading {file?.name}…</p>
          <p className="text-xs text-gray-400">Parsing and storing in Supabase</p>
        </div>
      )}

      {state === "done" && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">{file?.name}</p>
              <p className="text-xs text-green-600">{rowsImported?.toLocaleString()} rows imported</p>
            </div>
          </div>
          <button onClick={reset} className="text-gray-400 hover:text-gray-600 ml-3">
            <X size={16} />
          </button>
        </div>
      )}

      {state === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <p className="text-sm font-medium text-red-700">Upload failed</p>
          </div>
          <p className="text-xs text-red-600 mb-2">{error}</p>
          <button onClick={reset} className="text-xs text-red-600 underline">Try again</button>
        </div>
      )}
    </div>
  );
}
