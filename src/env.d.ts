/// <reference types="@rsbuild/core/types" />

/**
 * Imports the SVG file as a React component.
 * @requires [@rsbuild/plugin-svgr](https://npmjs.com/package/@rsbuild/plugin-svgr)
 */
declare module '*.svg?react' {
  import type React from 'react';
  const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}

/** 客户端环境变量（.env，PUBLIC_ 前缀经 Rsbuild 注入 import.meta.env），模板见 .env.example */
interface ImportMetaEnv {
  readonly PUBLIC_WALLET_PROJECT_ID: string
  readonly PUBLIC_WALLET_APP_NAME: string
}
