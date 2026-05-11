import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileSpreadsheet, X } from "lucide-react";

interface Props {
  label: string;
  file: File | null;
  onFile: (file: File) => void;
  onClear: () => void;
}

export default function FileDropzone({ label, file, onFile, onClear }: Props) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFile(accepted[0]);
    },
    [onFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
  });

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {file ? (
        <div className="flex items-center justify-between rounded-lg border border-green-300 bg-green-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-green-600" />
            <span className="text-sm text-green-800 truncate max-w-[160px]">{file.name}</span>
          </div>
          <button onClick={onClear} className="text-gray-400 hover:text-red-500 transition-colors">
            <X size={16} />
          </button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
            isDragActive
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50"
          }`}
        >
          <input {...getInputProps()} />
          <FileSpreadsheet size={22} className="mx-auto mb-1 text-gray-400" />
          <p className="text-xs text-gray-500">
            {isDragActive ? "Drop here" : "Drag & drop or click"}
          </p>
        </div>
      )}
    </div>
  );
}
