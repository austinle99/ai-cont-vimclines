import { NextRequest, NextResponse } from 'next/server';
import * as ExcelJS from 'exceljs';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ error: 'Only Excel files are allowed' }, { status: 400 });
    }

    // Parse Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    
    const results: any = {};
    
    // Check if we're in build time (no DATABASE_URL available)
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('file:')) {
      return NextResponse.json({
        error: "Database not available during build time"
      }, { status: 503 });
    }

    // Dynamic import to avoid build-time issues
    const { prisma } = await import('@/lib/db');
    
    // Process each worksheet
    workbook.eachSheet((worksheet) => {
      const sheetName = worksheet.name.toLowerCase();
      const rows: any[] = [];
      
      // Skip header row and get data
      worksheet.eachRow((row, rowIndex) => {
        if (rowIndex === 1) return; // Skip header
        
        const rowData: any = {};
        row.eachCell((cell, colNumber) => {
          // Get header from first row
          const headerCell = worksheet.getCell(1, colNumber);
          const header = headerCell.value?.toString().toLowerCase().trim();
          if (header) {
            rowData[header] = cell.value;
          }
        });
        
        if (Object.keys(rowData).length > 0) {
          rows.push(rowData);
        }
      });
      
      results[sheetName] = rows;
    });

    // Process different data types based on sheet names
    let insertedData: any = {};

    // Process Inventory data
    if (results.inventory || results.stock || results['tồn kho']) {
      const inventoryData = results.inventory || results.stock || results['tồn kho'];
      const inventoryRecords = [];
      
      for (const row of inventoryData) {
        const record = {
          port: row.port || row.cảng || row.location || '',
          type: row.type || row.loại || row.container_type || '',
          stock: parseInt(row.stock || row.quantity || row['số lượng'] || '0')
        };
        
        if (record.port && record.type && !isNaN(record.stock)) {
          inventoryRecords.push(record);
        }
      }
      
      if (inventoryRecords.length > 0) {
        // Clear existing inventory data
        await prisma.inventory.deleteMany();
        // Insert new data
        await prisma.inventory.createMany({
          data: inventoryRecords
        });
        insertedData.inventory = inventoryRecords.length;
      }
    }

    // Process Booking data
    if (results.booking || results.bookings || results['đặt chỗ']) {
      const bookingData = results.booking || results.bookings || results['đặt chỗ'];
      const bookingRecords = [];
      
      for (const row of bookingData) {
        const record = {
          date: new Date(row.date || row.ngày || Date.now()),
          origin: row.origin || row.xuất_phát || row.from || '',
          destination: row.destination || row.đích || row.to || '',
          size: row.size || row.kích_thước || row.container_size || '',
          qty: parseInt(row.qty || row.quantity || row['số lượng'] || '1'),
          customer: row.customer || row.khách_hàng || row.client || '',
          status: row.status || row.trạng_thái || 'active'
        };
        
        if (record.origin && record.destination && record.size) {
          bookingRecords.push(record);
        }
      }
      
      if (bookingRecords.length > 0) {
        await prisma.booking.createMany({
          data: bookingRecords
        });
        insertedData.booking = bookingRecords.length;
      }
    }

    // Process KPI data
    if (results.kpi || results['chỉ số']) {
      const kpiData = results.kpi || results['chỉ số'];
      if (kpiData.length > 0) {
        const row = kpiData[0];
        await prisma.kPI.upsert({
          where: { id: 1 },
          update: {
            utilization: row.utilization || row['sử dụng'] || '—',
            storageCost: row.storage_cost || row['chi phí lưu trữ'] || '—',
            dwellTime: row.dwell_time || row['thời gian lưu'] || '—',
            approvalRate: row.approval_rate || row['tỷ lệ phê duyệt'] || '0%'
          },
          create: {
            utilization: row.utilization || row['sử dụng'] || '—',
            storageCost: row.storage_cost || row['chi phí lưu trữ'] || '—',
            dwellTime: row.dwell_time || row['thời gian lưu'] || '—',
            approvalRate: row.approval_rate || row['tỷ lệ phê duyệt'] || '0%'
          }
        });
        insertedData.kpi = 1;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Excel file processed successfully',
      sheets: Object.keys(results),
      insertedData,
      preview: Object.entries(results).reduce((acc, [key, value]) => {
        acc[key] = Array.isArray(value) ? value.slice(0, 3) : value;
        return acc;
      }, {} as any)
    });

  } catch (error) {
    console.error('Excel upload error:', error);
    return NextResponse.json({
      error: 'Failed to process Excel file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}