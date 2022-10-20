import path from 'node:path';
import { isFile } from '../util/fs';
import { relative } from '../util/path';
import { OwnershipEngine } from '@snyk/github-codeowners/dist/lib/ownership';
import type { Entries } from 'type-fest';
import type { Report, ReporterOptions, IssueSet, IssueRecords } from '../types';

type ExtraReporterOptions = {
  codeowners?: string;
};

type Row = {
  file: string;
  owners: string[];
  files?: boolean;
  unlisted?: string[];
  exports?: string[];
  types?: string[];
  duplicates?: string[];
};

type ReportEntries = Omit<Report, 'dependencies' | 'devDependencies'>;
type MergedReportEntries = Exclude<keyof ReportEntries, 'files'>;

const mergeTypes = (type: MergedReportEntries) =>
  type === 'exports' || type === 'nsExports' ? 'exports' : type === 'types' || type === 'nsTypes' ? 'types' : type;

export default async ({ report, issues, options }: ReporterOptions) => {
  let opts: ExtraReporterOptions = {};
  try {
    opts = options ? JSON.parse(options) : opts;
  } catch (error) {
    console.error(error);
  }

  const json: Record<string, Row> = {};
  const codeownersFilePath = path.resolve(opts.codeowners ?? '.github/CODEOWNERS');
  const codeownersEngine = (await isFile(codeownersFilePath)) && OwnershipEngine.FromCodeownersFile(codeownersFilePath);

  const flatten = (issues: IssueRecords) => Object.values(issues).map(Object.values).flat();

  const initRow = (filePath: string) => {
    const file = relative(filePath);
    const row: Row = {
      file,
      ...(codeownersEngine && { owners: codeownersEngine.calcFileOwnership(file) }),
      ...(report.files && { files: false }),
      ...(report.unlisted && { unlisted: [] }),
      ...((report.exports || report.nsExports) && { exports: [] }),
      ...((report.types || report.nsTypes) && { types: [] }),
      ...(report.duplicates && { duplicates: [] }),
    };
    return row;
  };

  for (const [reportType, isReportType] of Object.entries(report) as Entries<ReportEntries>) {
    if (isReportType) {
      if (reportType === 'files') {
        Array.from(issues[reportType] as IssueSet).forEach(filePath => {
          json[filePath] = json[filePath] ?? initRow(filePath);
          json[filePath][reportType] = true;
        });
      } else {
        const type = mergeTypes(reportType);
        flatten(issues[reportType] as IssueRecords).forEach(({ filePath, symbol }) => {
          json[filePath] = json[filePath] ?? initRow(filePath);
          json[filePath][type]?.push(symbol);
        });
      }
    }
  }

  console.log(JSON.stringify(Object.values(json)));
};