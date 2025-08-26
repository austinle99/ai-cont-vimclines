import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
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
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return NextResponse.json({ error: 'No data found in Excel file' }, { status: 400 });
    }

    let result;
    
    // Import based on table selection
    switch (table) {
      case 'inventory':
        result = await prisma.inventory.createMany({
          data: data.map((row: any) => ({
            port: String(row.port || ''),
            type: String(row.type || ''),
            stock: parseInt(row.stock) || 0
          })),
          skipDuplicates: true
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
          })),
          skipDuplicates: true
        });
        break;

      case 'kpi':
        result = await prisma.kPI.createMany({
          data: data.map((row: any) => ({
            utilization: String(row.utilization || ''),
            storageCost: String(row.storageCost || ''),
            dwellTime: String(row.dwellTime || ''),
            approvalRate: String(row.approvalRate || '')
          })),
          skipDuplicates: true
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