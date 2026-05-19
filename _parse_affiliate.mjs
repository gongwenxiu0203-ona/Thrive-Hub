import * as XLSX from "xlsx";
import { readFileSync } from "fs";

const buf = readFileSync(
  "C:\\Users\\17863\\Desktop\\叮铃铃系统设置资料\\资源库字段.xlsx",
);
const wb = XLSX.read(buf, { type: "buffer" });

for (const sheetName of wb.SheetNames) {
  console.log(`\n===== Sheet: ${sheetName} =====`);
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  console.log("Rows:", data.length);
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const nonEmpty = row.filter((c) => c !== "" && c != null);
    if (nonEmpty.length === 0) continue;
    console.log(`\n--- Row ${i + 1} ---`);
    for (let j = 0; j < row.length; j++) {
      if (row[j] !== "" && row[j] != null) {
        const colLetter = XLSX.utils.encode_col(j);
        console.log(`  [${colLetter}]: ${String(row[j]).replace(/\n/g, " | ")}`);
      }
    }
  }
}
