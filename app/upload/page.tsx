import ExcelUpload from '@/components/ExcelUpload';

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">Data Import</h1>
        <ExcelUpload />
      </div>
    </div>
  );
}