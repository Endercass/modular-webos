import { type OpEnv } from "../openv";
import { type API } from "./api";

export class IdentityApi implements API {
  name = "party.openv.identity";
  openv: OpEnv;
  async populate(os: OpEnv): Promise<void> {
    this.openv = os;
  }

  async createIdentity(
    name: string,
    inherits: number[] = [],
    permissions: {
      [key: string]: boolean;
    } = {},
    id?: number,
    options: {
      root?: string;
    } = {},
  ): Promise<number> {
    options.root ??= this.name;

    if (typeof name !== "string" || name.length === 0) {
      throw new Error("Identity name must be a non-empty string.");
    }

    if (
      !Array.isArray(inherits) ||
      !inherits.every((i) => typeof i === "number")
    ) {
      throw new Error("Inherits must be an array of identities.");
    }

    if (typeof permissions !== "object" || permissions === null) {
      throw new Error("Permissions must be an object.");
    }

    let userIds: number[] = [];
    try {
      userIds = (await this.openv.registry.read(
        `${options.root}.userIds`,
      )) as number[];
    } catch {
      userIds = [];
    }

    if (!Array.isArray(userIds)) {
      throw new Error("User IDs must be an array.");
    }

    id ??= userIds.length > 0 ? Math.max(...userIds) + 1 : 1;

    if (id <= 0 || !Number.isInteger(id)) {
      throw new Error("ID must be a positive integer.");
    }

    if (userIds.includes(id)) {
      throw new Error(`User ID ${id} is already in use.`);
    }
    if (inherits.includes(id)) {
      throw new Error(`Identity ${id} cannot inherit from itself.`);
    }

    await this.openv.registry.write(`${options.root}.${id}.name`, name);
    await this.openv.registry.write(`${options.root}.${id}.inherits`, inherits);
    for (const [perm, value] of Object.entries(permissions)) {
      await this.openv.registry.write(
        `${options.root}.${id}.permissions.${perm}`,
        value,
      );
    }

    userIds.push(id);
    await this.openv.registry.write(
      `${options.root}.userIds`,
      userIds.sort((a, b) => a - b),
    );
    return id;
  }

  async getName(
    id: number,
    options: {
      root?: string;
    } = {},
  ): Promise<string> {
    options.root ??= this.name;
    if (typeof id !== "number" || id <= 0) {
      throw new Error("ID must be a positive integer.");
    }

    if (
      !(await this.openv.registry.has(`${options.root}.userIds`)) ||
      !(await this.openv.registry.has(`${options.root}.${id}.name`))
    ) {
      throw new Error(`Identity ${id} does not exist.`);
    }
    return (await this.openv.registry.read(
      `${options.root}.${id}.name`,
    )) as string;
  }

  async setPermission(
    id: number,
    permission: string,
    value: boolean,
    options: {
      root?: string;
    } = {},
  ): Promise<void> {
    options.root ??= this.name;
    if (typeof id !== "number" || id <= 0) {
      throw new Error("ID must be a positive integer.");
    }
    if (typeof permission !== "string" || permission.length === 0) {
      throw new Error("Permission must be a non-empty string.");
    }
    if (typeof value !== "boolean") {
      throw new Error("Permission value must be a boolean.");
    }
    if (
      !(await this.openv.registry.has(`${options.root}.userIds`)) ||
      !(await this.openv.registry.has(`${options.root}.${id}`))
    ) {
      throw new Error(`Identity ${id} does not exist.`);
    }
    await this.openv.registry.write(
      `${options.root}.${id}.permissions.${permission}`,
      value,
    );
  }

  async setPermissions(
    id: number,
    permissions: {
      [key: string]: boolean;
    },
    options: {
      root?: string;
    } = {},
  ): Promise<void> {
    options.root ??= this.name;
    if (typeof id !== "number" || id <= 0) {
      throw new Error("ID must be a positive integer.");
    }
    if (typeof permissions !== "object" || permissions === null) {
      throw new Error("Permissions must be an object.");
    }
    if (
      !(await this.openv.registry.has(`${options.root}.userIds`)) ||
      !(await this.openv.registry.has(`${options.root}.${id}`))
    ) {
      throw new Error(`Identity ${id} does not exist.`);
    }
    for (const [perm, value] of Object.entries(permissions)) {
      if (typeof perm !== "string" || perm.length === 0) {
        throw new Error("Permission must be a non-empty string.");
      }
      if (typeof value !== "boolean") {
        throw new Error("Permission value must be a boolean.");
      }
      await this.openv.registry.write(
        `${options.root}.${id}.permissions.${perm}`,
        value,
      );
    }
  }

  async hasPermission(
    id: number,
    permission: string,
    options: {
      root?: string;
    } = {},
  ): Promise<boolean> {
    options.root ??= this.name;
    if (typeof id !== "number" || id <= 0) {
      throw new Error("ID must be a positive integer.");
    }
    if (typeof permission !== "string" || permission.length === 0) {
      throw new Error("Permission must be a non-empty string.");
    }

    if (
      !(await this.openv.registry.has(`${options.root}.userIds`)) ||
      !(await this.openv.registry.has(`${options.root}.${id}`))
    ) {
      throw new Error(`Identity ${id} does not exist.`);
    }

    const visited = new Set<number>();
    const stack = [id];

    while (stack.length > 0) {
      const currentId = stack.pop() as number;

      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      const permPath = `${options.root}.${currentId}.permissions.${permission}`;
      if (await this.openv.registry.has(permPath)) {
        const permValue = await this.openv.registry.read(permPath);
        if (typeof permValue === "boolean") {
          return permValue;
        }
      }

      const inheritsPath = `${options.root}.${currentId}.inherits`;
      if (await this.openv.registry.has(inheritsPath)) {
        const inherits = await this.openv.registry.read(inheritsPath);
        if (Array.isArray(inherits)) {
          for (const parentId of inherits) {
            if (typeof parentId === "number" && !visited.has(parentId)) {
              stack.push(parentId);
            }
          }
        }
      }
    }

    return false;
  }
}
