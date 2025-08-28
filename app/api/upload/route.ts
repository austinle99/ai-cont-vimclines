import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Dynamic imports to avoid build-time issues
    const ExcelJS = await import('exceljs');
    const { prisma } = await import('@/lib/db');

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const table = formData.get('table') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!table) {
      return NextResponse.json({ error: 'No table specified' }, { status: 400 });
    }

    // Read Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      return NextResponse.json({ error: 'No worksheet found' }, { status: 400 });
    }
    
    // Convert worksheet to JSON
    const data: any[] = [];
    const headers: string[] = [];
    
    // Get headers from first row
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value);
    });
    
    // Get data from remaining rows
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const rowData: any = {};
      
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          rowData[header] = cell.value;
        }
      });
      
      // Only add row if it has data
      if (Object.keys(rowData).length > 0) {
        data.push(rowData);
      }
    }

    if (data.length === 0) {
      return NextResponse.json({ error: 'No data found in Excel file' }, { status: 400 });
    }

    let result: { count: number };
    
    // Import based on table selection
    switch (table) {
      case 'inventory':
        result = await prisma.inventory.createMany({
          data: data.map((row: any) => ({
            port: String(row.port || ''),
            type: String(row.type || ''),
            stock: parseInt(row.stock) || 0
          }))
        });
        break;

      case 'booking':
        result = await prisma.booking.createMany({
          data: data.map((row: any) => ({
            date: row.date ? new Date(row.date) : new Date(),
            origin: String(row.origin || ''),
            destination: String(row.destination || ''),
            size: String(row.size || ''),
            qty: parseInt(row.qty) || 0,
            customer: row.customer ? String(row.customer) : null,
            status: row.status ? String(row.status) : null
          }))
        });
        break;

      case 'kpi':
        result = await prisma.kPI.createMany({
          data: data.map((row: any) => ({
            utilization: String(row.utilization || ''),
            storageCost: String(row.storageCost || ''),
            dwellTime: String(row.dwellTime || ''),
            approvalRate: String(row.approvalRate || '')
          }))
        });
        break;

      default:
        return NextResponse.json({ error: 'Invalid table specified' }, { status: 400 });
    }

    return NextResponse.json({ 
      message: `Successfully imported ${result.count} records to ${table}`,
      count: result.count
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ 
      error: 'Failed to process file: ' + (error as Error).message 
    }, { status: 500 });
  }
}