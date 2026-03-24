declare module 'html-to-docx' {
  interface DocxOptions {
    table?: { row?: { cantSplit?: boolean } }
    footer?: boolean
    pageNumber?: boolean
    [key: string]: unknown
  }
  export default function htmlToDocx(
    htmlString: string,
    headerHTMLString: string | null,
    options?: DocxOptions
  ): Promise<Blob | Buffer | ArrayBuffer>
}
