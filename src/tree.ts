import * as yaml from "js-yaml";
import { isError } from "./helper-functions";
import * as core from "@actions/core";
import process from "process";

export const loadTree = (): DependencyTree => {
    core.startGroup("Load dependency tree");
    if (!process.env.DEP_TREE) {
        return {};
    }

    let treeData: DependencyTree;
    try {
        treeData = yaml.load(process.env.DEP_TREE) as DependencyTree;
    } catch (error) {
        if (error instanceof Error)
            isError(true, `Error loading dependency tree from $DEP_TREE`);
        return {};
    }
    core.info(`Dependency tree: ${JSON.stringify(treeData, null, 4)}`);
    core.endGroup();
    return treeData;
};

export const getDependenciesFromTree = (
    repo: string,
    tree: DependencyTree,
    dependencies: string[] | null
): string[] => {
    if (!dependencies) {
        dependencies = [];
    }
    if (tree[repo] == null) {
        return dependencies;
    }
    for (const dep of tree[repo].deps) {
        dependencies.push(dep);
        if (dep in tree) {
            getDependenciesFromTree(dep, tree, dependencies);
        }
    }
    return [...new Set(dependencies)];
};
