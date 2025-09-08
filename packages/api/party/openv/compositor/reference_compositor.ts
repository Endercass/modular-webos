import type { OpEnv } from "../../../../openv/mod";
import type { Compositor, WindowContent, WindowData } from "./compositor";
import type { ServiceApi } from "../service/mod";
import type { SurfacesApi } from "../surface/mod";

export class ReferenceCompositor implements Compositor<HTMLElement> {
  name = "party.openv.compositor";
  openv: OpEnv;

  async populate(openv: OpEnv) {
    this.openv = openv;
  }

  async start(): Promise<void> {
    let windows: number[] = [];
    try {
      windows = (await this.openv.registry.read(
        "party.openv.compositor.windows",
      )) as number[];
    } catch {}
    for (const wid of windows) {
      await this.openv.registry.delete(`party.openv.compositor.win.${wid}.wid`);
      await this.openv.registry.delete(
        `party.openv.compositor.win.${wid}.title`,
      );
      await this.openv.registry.delete(`party.openv.compositor.win.${wid}.x`);
      await this.openv.registry.delete(`party.openv.compositor.win.${wid}.y`);
      await this.openv.registry.delete(`party.openv.compositor.win.${wid}.z`);
      await this.openv.registry.delete(
        `party.openv.compositor.win.${wid}.minwidth`,
      );
      await this.openv.registry.delete(
        `party.openv.compositor.win.${wid}.minheight`,
      );
      await this.openv.registry.delete(
        `party.openv.compositor.win.${wid}.height`,
      );
      await this.openv.registry.delete(
        `party.openv.compositor.win.${wid}.width`,
      );
      await this.openv.registry.delete(
        `party.openv.compositor.win.${wid}.class`,
      );
      await this.openv.registry.delete(
        `party.openv.compositor.win.${wid}.resizable`,
      );
      await this.openv.registry.delete(
        `party.openv.compositor.win.${wid}.maximized`,
      );
      await this.openv.registry.delete(
        `party.openv.compositor.win.${wid}.content`,
      );
    }

    const services = this.openv.getAPI<ServiceApi>("party.openv.service");

    let displays: string[] = [];
    try {
      displays = (await this.openv.registry.read(
        "party.openv.compositor.displays",
      )) as string[];
    } catch {}
    for (const display of displays) {
      await this.openv.registry.delete(
        `party.openv.compositor.${display}.width`,
      );
      await this.openv.registry.delete(
        `party.openv.compositor.${display}.height`,
      );
      await services.clearFunctions(display, { root: this.name });
    }

    await this.openv.registry.write("party.openv.compositor.windows", []);
    await this.openv.registry.write("party.openv.compositor.displays", []);
  }

  async displays(): Promise<string[]> {
    try {
      return (await this.openv.registry.read(
        "party.openv.compositor.displays",
      )) as string[];
    } catch {
      await this.openv.registry.write("party.openv.compositor.displays", []);
      return [];
    }
  }
  async join(root: HTMLElement, namespace: string): Promise<void> {
    root.style.position = "absolute";
    root.style.top = "0";
    root.style.left = "0";
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.overflow = "hidden";
    root.style.backgroundColor = "#000000";

    addEventListener("resize", () => {
      this.openv.registry.write(
        `party.openv.compositor.${namespace}.width`,
        window.innerWidth,
      );
      this.openv.registry.write(
        `party.openv.compositor.${namespace}.height`,
        window.innerHeight,
      );
    });

    // Initial write
    window.dispatchEvent(new Event("resize"));

    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    await services.defineFunction(
      "create",
      this.#create.bind(this, root) as any,
      namespace,
      { root: this.name },
    );

    const displays = (await this.openv.registry.read(
      "party.openv.compositor.displays",
    )) as string[];

    displays.push(namespace);
    await this.openv.registry.write(
      "party.openv.compositor.displays",
      displays.filter((v, i, a) => a.indexOf(v) === i),
    );
  }
  async displayInfo(
    namespace: string,
  ): Promise<{ width: number; height: number } | null> {
    try {
      const width = (await this.openv.registry.read(
        `party.openv.compositor.${namespace}.width`,
      )) as number;
      const height = (await this.openv.registry.read(
        `party.openv.compositor.${namespace}.height`,
      )) as number;
      return { width, height };
    } catch {
      return null;
    }
  }

  async #create(
    root: HTMLElement,
    _info: Partial<WindowData>,
  ): Promise<WindowData> {
    const info = {
      wid: _info.wid ?? Math.floor(Math.random() * 0xffffffff),
      title: _info.title ?? "Untitled",
      x: _info.x ?? window.innerWidth / 2 - (_info.width ?? 300) / 2,
      y: _info.y ?? window.innerHeight / 2 - (_info.height ?? 200) / 2,
      z: _info.z ?? 0,
      minwidth: _info.minwidth ?? 100,
      minheight: _info.minheight ?? 100,
      height: _info.height ?? 200,
      width: _info.width ?? 300,
      class: _info.class ?? "default",
      resizable: _info.resizable !== undefined ? _info.resizable : true,
      maximized: _info.maximized ?? false,
      content: _info.content ?? { type: "iframe", src: "about:blank" },
    } as WindowData;

    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.wid`,
      info.wid,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.title`,
      info.title,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.x`,
      info.x,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.y`,
      info.y,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.z`,
      info.z,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.minwidth`,
      info.minwidth,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.minheight`,
      info.minheight,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.height`,
      info.height,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.width`,
      info.width,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.class`,
      info.class,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.resizable`,
      info.resizable,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.maximized`,
      info.maximized,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${info.wid}.content`,
      info.content,
    );

    let wins: number[] = [];
    try {
      wins = (await this.openv.registry.read(
        "party.openv.compositor.windows",
      )) as number[];
    } catch {}

    wins.push(info.wid);
    await this.openv.registry.write("party.openv.compositor.windows", wins);

    const win = document.createElement("div");
    win.style.position = "absolute";
    win.style.border = "4px solid #b0eced";
    win.style.backgroundColor = "#222222";
    win.style.boxSizing = "border-box";
    win.style.color = "#ffffff";
    win.style.display = "flex";
    win.style.flexDirection = "column";

    this.openv.registry.watch(
      `party.openv.compositor.win.${info.wid}.x`,
      (value) => {
        if (typeof value !== "number") return;
        info.x = value;
        win.style.left = value + "px";
      },
    );
    this.openv.registry.watch(
      `party.openv.compositor.win.${info.wid}.y`,
      (value) => {
        if (typeof value !== "number") return;
        info.y = value;
        win.style.top = value + "px";
      },
    );
    this.openv.registry.watch(
      `party.openv.compositor.win.${info.wid}.width`,
      (value) => {
        if (typeof value !== "number") return;
        info.width = value;
        win.style.width = value + "px";
      },
    );
    this.openv.registry.watch(
      `party.openv.compositor.win.${info.wid}.height`,
      (value) => {
        if (typeof value !== "number") return;
        info.height = value;
        win.style.height = value + "px";
      },
    );
    this.openv.registry.watch(
      `party.openv.compositor.win.${info.wid}.z`,
      (value) => {
        if (typeof value !== "number") return;
        info.z = value;
        win.style.zIndex = value?.toString() || "0";
      },
    );

    this.openv.registry.watch(
      `party.openv.compositor.win.${info.wid}.resizable`,
      (value) => {
        if (typeof value !== "boolean") return;
        info.resizable = value;
      },
    );

    this.openv.registry.watch(
      `party.openv.compositor.win.${info.wid}.class`,
      (value) => {
        if (typeof value !== "string") return;
        info.class = value;
      },
    );

    this.openv.registry.watch(
      `party.openv.compositor.win.${info.wid}.minwidth`,
      (value) => {
        if (typeof value !== "number") return;
        info.minwidth = value;
      },
    );
    this.openv.registry.watch(
      `party.openv.compositor.win.${info.wid}.minheight`,
      (value) => {
        if (typeof value !== "number") return;
        info.minheight = value;
      },
    );

    const leftResizer = document.createElement("div");
    leftResizer.style.position = "absolute";
    leftResizer.style.left = "-4px";
    leftResizer.style.top = "0";
    leftResizer.style.width = "4px";
    leftResizer.style.height = "100%";
    leftResizer.style.cursor = "ew-resize";
    win.appendChild(leftResizer);

    const rightResizer = document.createElement("div");
    rightResizer.style.position = "absolute";
    rightResizer.style.right = "-4px";
    rightResizer.style.top = "0";
    rightResizer.style.width = "4px";
    rightResizer.style.height = "100%";
    rightResizer.style.cursor = "ew-resize";
    win.appendChild(rightResizer);

    const upResizer = document.createElement("div");
    upResizer.style.position = "absolute";
    upResizer.style.left = "0";
    upResizer.style.top = "-4px";
    upResizer.style.width = "100%";
    upResizer.style.height = "4px";
    upResizer.style.cursor = "ns-resize";
    win.appendChild(upResizer);

    const downResizer = document.createElement("div");
    downResizer.style.position = "absolute";
    downResizer.style.left = "0";
    downResizer.style.bottom = "-4px";
    downResizer.style.width = "100%";
    downResizer.style.height = "4px";
    downResizer.style.cursor = "ns-resize";
    win.appendChild(downResizer);

    let isResizing = false;
    let resizeDir: "left" | "right" | "up" | "down" | null = null;

    leftResizer.addEventListener("pointerdown", async (e) => {
      if (!info.resizable) return;
      isResizing = true;
      resizeDir = "left";
      document.querySelectorAll("iframe").forEach((f) => {
        f.style.pointerEvents = "none";
      });
      this.focus(info.wid);
      if (
        await this.openv.registry.read(
          `party.openv.compositor.win.${info.wid}.maximized`,
        )
      ) {
        this.openv.registry.write(
          `party.openv.compositor.win.${info.wid}.maximized`,
          false,
        );
      }
      e.preventDefault();
    });

    rightResizer.addEventListener("pointerdown", async (e) => {
      if (!info.resizable) return;
      isResizing = true;
      resizeDir = "right";
      document.querySelectorAll("iframe").forEach((f) => {
        f.style.pointerEvents = "none";
      });
      this.focus(info.wid);
      if (
        await this.openv.registry.read(
          `party.openv.compositor.win.${info.wid}.maximized`,
        )
      ) {
        this.openv.registry.write(
          `party.openv.compositor.win.${info.wid}.maximized`,
          false,
        );
      }
      e.preventDefault();
    });

    upResizer.addEventListener("pointerdown", async (e) => {
      if (!info.resizable) return;
      isResizing = true;
      resizeDir = "up";
      document.querySelectorAll("iframe").forEach((f) => {
        f.style.pointerEvents = "none";
      });
      this.focus(info.wid);
      if (
        await this.openv.registry.read(
          `party.openv.compositor.win.${info.wid}.maximized`,
        )
      ) {
        this.openv.registry.write(
          `party.openv.compositor.win.${info.wid}.maximized`,
          false,
        );
      }
      e.preventDefault();
    });

    downResizer.addEventListener("pointerdown", async (e) => {
      if (!info.resizable) return;
      isResizing = true;
      resizeDir = "down";
      document.querySelectorAll("iframe").forEach((f) => {
        f.style.pointerEvents = "none";
      });
      this.focus(info.wid);
      if (
        await this.openv.registry.read(
          `party.openv.compositor.win.${info.wid}.maximized`,
        )
      ) {
        this.openv.registry.write(
          `party.openv.compositor.win.${info.wid}.maximized`,
          false,
        );
      }
      e.preventDefault();
    });

    const titleBar = document.createElement("div");
    titleBar.style.backgroundColor = "#1a1a1a";
    titleBar.style.display = "flex";
    titleBar.style.alignItems = "center";
    titleBar.style.justifyContent = "space-between";
    titleBar.style.cursor = "move";

    const buttonBox = document.createElement("div");
    buttonBox.style.display = "flex";
    buttonBox.style.alignItems = "center";
    buttonBox.style.justifyContent = "center";

    let isDragging = false;

    titleBar.addEventListener("pointerdown", async (e) => {
      if (e.target === buttonBox || buttonBox.contains(e.target as Node)) {
        return;
      }
      isDragging = true;
      document.querySelectorAll("iframe").forEach((f) => {
        f.style.pointerEvents = "none";
      });
      this.focus(info.wid);
      if (
        await this.openv.registry.read(
          `party.openv.compositor.win.${info.wid}.maximized`,
        )
      ) {
        this.openv.registry.write(
          `party.openv.compositor.win.${info.wid}.maximized`,
          false,
        );
      }
      e.preventDefault();
    });

    let pointerover = false;

    win.addEventListener("pointerover", () => {
      pointerover = true;
    });
    win.addEventListener("pointerleave", () => {
      pointerover = false;
    });

    addEventListener("blur", () => {
      if (pointerover) {
        win.focus();
      }
    });

    document.addEventListener("pointerup", () => {
      if (isDragging) {
        this.move(info.wid, info.x, info.y);
        isDragging = false;
      }
      if (isResizing) {
        this.resize(info.wid, info.width, info.height);
        isResizing = false;
        resizeDir = null;
      }
      document.querySelectorAll("iframe").forEach((f) => {
        f.style.pointerEvents = "auto";
      });
    });

    document.addEventListener("pointermove", (e) => {
      if (isResizing) {
        switch (resizeDir) {
          case "left": {
            const newWidth = info.width + (info.x - e.clientX);
            if (newWidth >= info.minwidth) {
              info.width = newWidth;
              info.x = e.clientX;
              if (info.x < 0) {
                info.width = info.width + info.x;
                info.x = 0;
              }
              win.style.width = info.width + "px";
              win.style.left = info.x + "px";
            }
            break;
          }
          case "right": {
            const newWidth = e.clientX - info.x;
            if (newWidth >= info.minwidth) {
              info.width = newWidth;
              if (info.x + info.width > window.innerWidth) {
                info.width = window.innerWidth - info.x;
              }
              win.style.width = info.width + "px";
            }
            break;
          }
          case "up": {
            const newHeight = info.height + (info.y - e.clientY);
            if (newHeight >= info.minheight) {
              info.height = newHeight;
              info.y = e.clientY;
              if (info.y < 0) {
                info.height = info.height + info.y;
                info.y = 0;
              }
              win.style.height = info.height + "px";
              win.style.top = info.y + "px";
            }
            break;
          }
          case "down": {
            const newHeight = e.clientY - info.y;
            if (newHeight >= info.minheight) {
              info.height = newHeight;
              if (info.y + info.height > window.innerHeight)
                info.height = window.innerHeight - info.y;
              win.style.height = info.height + "px";
            }
            break;
          }
        }
      }

      if (isDragging) {
        info.x = e.clientX - titleBar.offsetWidth / 2;
        info.y = e.clientY - titleBar.offsetHeight / 2;
        if (info.x < 0) info.x = 0;
        if (info.y < 0) info.y = 0;
        if (info.x + info.width > window.innerWidth)
          info.x = window.innerWidth - info.width;
        if (info.y + info.height > window.innerHeight)
          info.y = window.innerHeight - info.height;
        win.style.left = info.x + "px";
        win.style.top = info.y + "px";
      }
    });

    const title = document.createElement("span");
    title.style.padding = "4px";
    title.textContent = info.title;

    this.openv.registry.watch(
      `party.openv.compositor.win.${info.wid}.title`,
      (value) => {
        if (typeof value !== "string") return;
        info.title = value;
        title.textContent = value;
      },
    );

    titleBar.appendChild(title);
    titleBar.appendChild(buttonBox);

    const maximizeButton = document.createElement("button");
    maximizeButton.textContent = "[ ]";
    maximizeButton.style.width = "24px";
    maximizeButton.style.height = "24px";
    maximizeButton.style.margin = "4px";
    maximizeButton.style.padding = "0";
    maximizeButton.style.display = "flex";
    maximizeButton.style.alignItems = "center";
    maximizeButton.style.justifyContent = "center";
    maximizeButton.style.cursor = "pointer";

    let lastSize: { x: number; y: number; width: number; height: number } = {
      x: info.x,
      y: info.y,
      width: info.width,
      height: info.height,
    };

    maximizeButton.addEventListener("click", async (e) => {
      e.stopPropagation();
      info.maximized = !info.maximized;
      await this.openv.registry.write(
        `party.openv.compositor.win.${info.wid}.maximized`,
        info.maximized,
      );
    });
    buttonBox.appendChild(maximizeButton);

    this.openv.registry.watch(
      `party.openv.compositor.win.${info.wid}.maximized`,
      (value) => {
        if (typeof value !== "boolean") return;
        info.maximized = value;
        if (value) {
          // Maximize
          lastSize = {
            x: info.x,
            y: info.y,
            width: info.width,
            height: info.height,
          };
          this.openv.registry.write(
            `party.openv.compositor.win.${info.wid}.x`,
            0,
          );
          this.openv.registry.write(
            `party.openv.compositor.win.${info.wid}.y`,
            0,
          );
          this.openv.registry.write(
            `party.openv.compositor.win.${info.wid}.width`,
            window.innerWidth,
          );
          this.openv.registry.write(
            `party.openv.compositor.win.${info.wid}.height`,
            window.innerHeight,
          );
        } else {
          // Restore
          this.openv.registry.write(
            `party.openv.compositor.win.${info.wid}.x`,
            lastSize.x,
          );
          this.openv.registry.write(
            `party.openv.compositor.win.${info.wid}.y`,
            lastSize.y,
          );
          this.openv.registry.write(
            `party.openv.compositor.win.${info.wid}.width`,
            lastSize.width,
          );
          this.openv.registry.write(
            `party.openv.compositor.win.${info.wid}.height`,
            lastSize.height,
          );
        }
      },
    );

    addEventListener("resize", () => {
      if (info.maximized) {
        this.openv.registry.write(
          `party.openv.compositor.win.${info.wid}.x `,
          0,
        );
        this.openv.registry.write(
          `party.openv.compositor.win.${info.wid}.y`,
          0,
        );
        this.openv.registry.write(
          `party.openv.compositor.win.${info.wid}.width`,
          window.innerWidth,
        );
        this.openv.registry.write(
          `party.openv.compositor.win.${info.wid}.height`,
          window.innerHeight,
        );
      }
    });

    const closeButton = document.createElement("button");
    closeButton.textContent = "X";
    closeButton.style.width = "24px";
    closeButton.style.height = "24px";
    closeButton.style.margin = "4px";
    closeButton.style.padding = "0";
    closeButton.style.display = "flex";
    closeButton.style.alignItems = "center";
    closeButton.style.justifyContent = "center";
    closeButton.style.cursor = "pointer";
    closeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.destroy(info.wid);
    });
    buttonBox.appendChild(closeButton);

    win.appendChild(titleBar);

    const contentBox = document.createElement("div");
    contentBox.style.width = "100%";
    contentBox.style.flexGrow = "1";
    contentBox.style.overflow = "hidden";
    win.appendChild(contentBox);

    this.openv.registry.watch(
      `party.openv.compositor.win.${info.wid}.content`,
      async (value) => {
        if (typeof value !== "object" || value === null || !("type" in value))
          return;
        info.content = value as WindowContent;
        while (contentBox.children.length > 1) {
          contentBox.removeChild(win.lastChild!);
        }
        if (info.content.type === "iframe") {
          const iframe = document.createElement("iframe");
          iframe.src = info.content.src;
          iframe.sandbox = "allow-scripts";
          iframe.style.width = "100%";
          iframe.style.height = "100%";
          iframe.style.border = "none";
          contentBox.appendChild(iframe);
        } else if (info.content.type === "surface") {
          const canvas = document.createElement("canvas");
          canvas.width = info.width;
          canvas.height = info.height - titleBar.offsetHeight;
          canvas.style.width = "100%";
          canvas.style.height = "100%";
          const surfaces = this.openv.getAPI<SurfacesApi>(
            "party.openv.surface",
          );
          await surfaces.register(
            info.content.sid,
            surfaces.createCanvasSurface(canvas),
          );
          contentBox.appendChild(canvas);
        }
      },
    );

    root.appendChild(win);

    this.openv.registry.watch(`party.openv.compositor.windows`, (value) => {
      if (!Array.isArray(value)) return;
      if (!value.includes(info.wid)) {
        root.removeChild(win);
        this.openv.registry.delete(
          `party.openv.compositor.win.${info.wid}.wid`,
        );
        this.openv.registry.delete(
          `party.openv.compositor.win.${info.wid}.title`,
        );
        this.openv.registry.delete(`party.openv.compositor.win.${info.wid}.x`);
        this.openv.registry.delete(`party.openv.compositor.win.${info.wid}.y`);
        this.openv.registry.delete(`party.openv.compositor.win.${info.wid}.z`);
        this.openv.registry.delete(
          `party.openv.compositor.win.${info.wid}.minwidth`,
        );
        this.openv.registry.delete(
          `party.openv.compositor.win.${info.wid}.minheight`,
        );
        this.openv.registry.delete(
          `party.openv.compositor.win.${info.wid}.height`,
        );
        this.openv.registry.delete(
          `party.openv.compositor.win.${info.wid}.width`,
        );
        this.openv.registry.delete(
          `party.openv.compositor.win.${info.wid}.class`,
        );
        this.openv.registry.delete(
          `party.openv.compositor.win.${info.wid}.resizable`,
        );
        this.openv.registry.delete(
          `party.openv.compositor.win.${info.wid}.content`,
        );
      }
    });

    this.focus(info.wid);

    return info;
  }
  async create(info: Partial<WindowData>): Promise<WindowData> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");

    const displays = (await this.openv.registry.read(
      "party.openv.compositor.displays",
    )) as string[];

    if (displays.length === 0) {
      throw new Error("No displays available");
    }

    if (!info.namespace) {
      info.namespace = displays[0];
    }

    if (!displays.includes(info.namespace)) {
      throw new Error("Namespace not joined as a display");
    }

    return (await services.callFunction(
      "create",
      [info as any],
      info.namespace,
      {
        root: this.name,
      },
    )) as any;
  }
  async info(wid: number): Promise<WindowData | null> {
    try {
      const info = {
        wid: (await this.openv.registry.read(
          `party.openv.compositor.win.${wid}.wid`,
        )) as number,
        title: (await this.openv.registry.read(
          `party.openv.compositor.win.${wid}.title`,
        )) as string,
        x: (await this.openv.registry.read(
          `party.openv.compositor.win.${wid}.x`,
        )) as number,
        y: (await this.openv.registry.read(
          `party.openv.compositor.win.${wid}.y`,
        )) as number,
        z: (await this.openv.registry.read(
          `party.openv.compositor.win.${wid}.z`,
        )) as number,
        minwidth: (await this.openv.registry.read(
          `party.openv.compositor.win.${wid}.minwidth`,
        )) as number,
        minheight: (await this.openv.registry.read(
          `party.openv.compositor.win.${wid}.minheight`,
        )) as number,
        height: (await this.openv.registry.read(
          `party.openv.compositor.win.${wid}.height`,
        )) as number,
        width: (await this.openv.registry.read(
          `party.openv.compositor.win.${wid}.width`,
        )) as number,
        class: (await this.openv.registry.read(
          `party.openv.compositor.win.${wid}.class`,
        )) as string,
        resizable: (await this.openv.registry.read(
          `party.openv.compositor.win.${wid}.resizable`,
        )) as boolean,
        content: (await this.openv.registry.read(
          `party.openv.compositor.win.${wid}.content`,
        )) as WindowContent,
      } as WindowData;
      return info;
    } catch {
      return null;
    }
  }
  async destroy(wid: number): Promise<void> {
    let wins: number[] = [];
    try {
      wins = (await this.openv.registry.read(
        "party.openv.compositor.windows",
      )) as number[];
    } catch {}

    wins = wins.filter((w) => w !== wid);
    await this.openv.registry.write("party.openv.compositor.windows", wins);
  }

  async windows(): Promise<number[]> {
    try {
      return (await this.openv.registry.read(
        "party.openv.compositor.windows",
      )) as number[];
    } catch {
      await this.openv.registry.write("party.openv.compositor.windows", []);
      return [];
    }
  }

  async setTitle(wid: number, title: string): Promise<void> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");

    await this.openv.registry.write(
      `party.openv.compositor.win.${wid}.title`,
      title,
    );
  }
  async title(wid: number): Promise<string> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");
    return info.title;
  }

  async setContent(wid: number, content: WindowContent): Promise<void> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");

    await this.openv.registry.write(
      `party.openv.compositor.win.${wid}.content`,
      content,
    );
  }
  async content(wid: number): Promise<WindowContent> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");
    return info.content;
  }

  async setLimits(
    wid: number,
    maxwidth: number,
    maxheight: number,
  ): Promise<void> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");

    await this.openv.registry.write(
      `party.openv.compositor.win.${wid}.maxwidth`,
      maxwidth,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${wid}.maxheight`,
      maxheight,
    );
  }
  async limits(wid: number): Promise<{ maxwidth: number; maxheight: number }> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");
    let maxwidth = 1920;
    let maxheight = 1080;
    try {
      maxwidth = (await this.openv.registry.read(
        `party.openv.compositor.win.${wid}.maxwidth`,
      )) as number;
    } catch {}
    try {
      maxheight = (await this.openv.registry.read(
        `party.openv.compositor.win.${wid}.maxheight`,
      )) as number;
    } catch {}
    return { maxwidth, maxheight };
  }

  async setResizable(wid: number, resizable: boolean): Promise<void> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");

    await this.openv.registry.write(
      `party.openv.compositor.win.${wid}.resizable`,
      resizable,
    );
  }
  async resizable(wid: number): Promise<boolean> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");
    return info.resizable;
  }

  async setMaximized(wid: number, maximized: boolean): Promise<void> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");

    await this.openv.registry.write(
      `party.openv.compositor.win.${wid}.maximized`,
      maximized,
    );
  }
  async maximized(wid: number): Promise<boolean> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");
    return info.maximized;
  }

  async namespace(wid: number): Promise<string> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");
    return info.namespace;
  }

  async setClass(wid: number, cls: string): Promise<void> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");

    await this.openv.registry.write(
      `party.openv.compositor.win.${wid}.class`,
      cls,
    );
  }
  async class(wid: number): Promise<string> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");
    return info.class;
  }

  async resize(wid: number, width: number, height: number): Promise<void> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");

    if (width < info.minwidth) width = info.minwidth;
    if (height < info.minheight) height = info.minheight;

    await this.openv.registry.write(
      `party.openv.compositor.win.${wid}.width`,
      width,
    );
    await this.openv.registry.write(
      `party.openv.compositor.win.${wid}.height`,
      height,
    );
  }
  async move(wid: number, x: number, y: number): Promise<void> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");

    if (x < 0) x = 0;
    if (y < 0) y = 0;

    await this.openv.registry.write(`party.openv.compositor.win.${wid}.x`, x);
    await this.openv.registry.write(`party.openv.compositor.win.${wid}.y`, y);
  }
  async rect(wid: number): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");
    return {
      x: info.x,
      y: info.y,
      width: info.width,
      height: info.height,
    };
  }

  async focus(wid: number): Promise<void> {
    const info = await this.info(wid);
    if (!info) throw new Error("Window not found");

    let maxZ = 0;
    const wins: number[] = (await this.openv.registry.read(
      "party.openv.compositor.windows",
    )) as number[];
    for (const w of wins) {
      const winInfo = await this.info(w);
      if (winInfo && winInfo.z > maxZ) {
        maxZ = winInfo.z;
      }
    }
    await this.openv.registry.write(
      `party.openv.compositor.win.${wid}.z`,
      maxZ + 1,
    );
  }
}
