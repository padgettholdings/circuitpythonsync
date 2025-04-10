/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

//const CopyPlugin = require('copy-webpack-plugin');
const path = require('path');

/**@type {import('webpack').Configuration}*/
const config = {
    target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
    // node: {
    //     __dirname: true,
    // },
    entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    output: { // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: "commonjs2",
        devtoolModuleFilenameTemplate: "../[resource-path]",
    },
    devtool: 'source-map',
    externals: {
        vscode: "commonjs vscode",// the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
        //drivelist: 'drivelist' // Exclude drivelist from webpack bundling, it will be required at runtime
    },
    resolve: { // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [{
            test: /\.ts$/,
            exclude: /node_modules/,
            use: [{
                loader: 'ts-loader',
                options: {
                    compilerOptions: {
                        "module": "es6" // override `tsconfig.json` so that TypeScript emits native JavaScript modules.
                    }
                }
            }]
        },
        // {
        //     test: /\.node$/,
        //     loader: 'node-loader',
        //     options: {
        //         // This will ensure that the .node files are bundled correctly
        //         // and can be required in the Node.js context.
        //         name: '[name].[ext]',
        //     },
        // }
        ]
    },
    plugins: [
        // new CopyPlugin({
        //     patterns: [
        //         // Copy the static assets to the dist folder
        //         { from: path.resolve(__dirname, 'resources'), to: path.resolve(__dirname, 'resources'), noErrorOnMissing: true },
        //         // {from: path.resolve(__dirname,'node_modules/drivelist/build/Release/drivelist.node'), to: path.resolve(__dirname, 'dist/drivelist.node'),
        //         //     // Ensure the .node file is copied to the dist folder
        //         //     noErrorOnMissing: true // Don't fail the build if the file is missing
        //         // }
        //     ],
        // }),
        /**
         * Note: Don't forget to add your webpack plugins here.
         * For example, you can add the `DefinePlugin` to set environment variables.
         */
    ],
};

module.exports = config;
