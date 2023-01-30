import fs from 'fs';
import * as yaml from 'js-yaml';
import { isError } from './helper-functions';
import path from 'path';
import * as core from '@actions/core';
import process from 'process';


export const loadTree = async (): Promise<DependencyTree> => {
    const fileName = "dependency-tree.yml";

    if (!process.env.RUNNER_WORKSPACE || !process.env.GITHUB_ACTION_REPOSITORY || !process.env.GITHUB_ACTION_REF) {
        return {};
    }

    const filePath = path.join(
        process.env.RUNNER_WORKSPACE,
        "..",
        "_actions",
        process.env.GITHUB_ACTION_REPOSITORY,
        process.env.GITHUB_ACTION_REF,
        fileName
    );

    core.info(`Dependency tree path: ${filePath}`);

    let treeData: DependencyTree;
    try {
        treeData = yaml.load(fs.readFileSync(filePath, 'utf8')) as DependencyTree;
    } catch (error) {
        if (error instanceof Error) isError(true, `Error loading data from ${fileName}`);
        return {};
    }
    return treeData;
};