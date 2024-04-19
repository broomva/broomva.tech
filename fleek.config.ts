import { FleekConfig } from '@fleekxyz/cli';

export default {
  "sites": [
    {
      "slug": "broomva",
      "distDir": "out",
      "buildCommand": "yarn build"
    }
  ]
} satisfies FleekConfig;