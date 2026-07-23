#!/usr/bin/env python3
"""
Validate an Agent Skill directory against the agentskills.io specification.

Usage:
    python3 validate.py <skill-directory>
    python3 validate.py /path/to/skills/  # validate all skills in a directory

Exit codes:
    0 - All checks passed (warnings are OK)
    1 - One or more errors found
"""

import sys
import os
import re


def parse_frontmatter(content):
    """Extract and parse YAML frontmatter from SKILL.md content."""
    if not content.startswith("---"):
        return None, "SKILL.md does not start with YAML frontmatter (---)"

    end = content.find("---", 3)
    if end == -1:
        return None, "Frontmatter closing '---' not found"

    fm_text = content[3:end].strip()
    fm = {}
    current_key = None
    multiline_value = []
    multiline_mode = None  # '>' or '|-' or '>-'

    for line in fm_text.splitlines():
        # Top-level key
        key_match = re.match(r'^([a-zA-Z0-9_-]+)\s*:\s*(.*)', line)
        if key_match and not line.startswith(" "):
            if current_key and multiline_mode is not None:
                val = " ".join(multiline_value) if multiline_mode.startswith(">") else "\n".join(multiline_value)
                fm[current_key] = val.strip()
                multiline_value = []
            current_key = key_match.group(1)
            val = key_match.group(2).strip()
            if val in (">-", ">", "|", "|-"):
                multiline_mode = val
            elif val == "":
                multiline_mode = None
                fm[current_key] = {}
            else:
                multiline_mode = None
                fm[current_key] = val
        elif line.startswith("  ") and current_key:
            stripped = line.strip()
            if multiline_mode is not None:
                multiline_value.append(stripped)
            elif stripped.startswith("- "):
                if not isinstance(fm.get(current_key), list):
                    fm[current_key] = []
                fm[current_key].append(stripped[2:])
            else:
                kv = re.match(r'([a-zA-Z0-9_-]+)\s*:\s*(.*)', stripped)
                if kv:
                    if not isinstance(fm.get(current_key), dict):
                        fm[current_key] = {}
                    fm[current_key][kv.group(1)] = kv.group(2).strip().strip('"')

    if current_key and multiline_mode is not None and multiline_value:
        val = " ".join(multiline_value) if multiline_mode.startswith(">") else "\n".join(multiline_value)
        fm[current_key] = val.strip()

    return fm, None


def extract_links(body):
    """Extract all relative file links from markdown body."""
    return re.findall(r'\[(?:[^\]]*)\]\(([^)#http][^)]*)\)', body)


def validate_skill(skill_dir):
    errors = []
    warnings = []
    infos = []

    skill_dir = os.path.abspath(skill_dir)
    dir_name = os.path.basename(skill_dir)
    skill_md_path = os.path.join(skill_dir, "SKILL.md")

    # ── 1. SKILL.md 存在性 ──────────────────────────────────────────────────
    if not os.path.exists(skill_md_path):
        errors.append("SKILL.md not found")
        return errors, warnings, infos

    with open(skill_md_path, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.splitlines()
    infos.append(f"SKILL.md: {len(lines)} lines")

    # ── 2. 行数限制 ────────────────────────────────────────────────────────
    if len(lines) > 500:
        errors.append(f"SKILL.md exceeds 500 lines ({len(lines)} lines) — move detailed content to references/")
    elif len(lines) > 300:
        warnings.append(f"SKILL.md is {len(lines)} lines; consider moving detailed sections to references/")

    # ── 3. Frontmatter 解析 ────────────────────────────────────────────────
    fm, parse_err = parse_frontmatter(content)
    if parse_err:
        errors.append(f"Frontmatter parse error: {parse_err}")
        return errors, warnings, infos

    # ── 4. name 字段 ───────────────────────────────────────────────────────
    name = fm.get("name", "")
    if not name:
        errors.append("Required field 'name' is missing")
    else:
        name = str(name)
        if len(name) > 64:
            errors.append(f"name '{name}' exceeds 64 characters ({len(name)} chars)")
        if re.search(r'[^a-z0-9-]', name):
            errors.append(f"name '{name}' contains invalid characters (only lowercase a-z, 0-9, hyphens allowed)")
        if name.startswith("-") or name.endswith("-"):
            errors.append(f"name '{name}' must not start or end with a hyphen")
        if "--" in name:
            errors.append(f"name '{name}' contains consecutive hyphens (--)")
        if name != dir_name:
            errors.append(f"name '{name}' does not match directory name '{dir_name}'")
        else:
            infos.append(f"name: '{name}' ✓ matches directory")

    # ── 5. description 字段 ────────────────────────────────────────────────
    desc = fm.get("description", "")
    if not desc:
        errors.append("Required field 'description' is missing")
    else:
        desc_str = str(desc)
        char_count = len(desc_str)
        if char_count > 1024:
            errors.append(f"description exceeds 1024 characters ({char_count} chars)")
        elif char_count < 30:
            warnings.append(f"description is very short ({char_count} chars); include WHAT the skill does and WHEN to use it")
        else:
            infos.append(f"description: {char_count} chars ✓")

        trigger_hints = ["use when", "适用于", "当用户", "when user", "when the user"]
        if not any(h in desc_str.lower() for h in trigger_hints):
            warnings.append("description may be missing trigger keywords ('use when', '适用于', etc.)")

    # ── 6. compatibility 字段（可选） ──────────────────────────────────────
    compat = fm.get("compatibility", None)
    if compat:
        compat_str = str(compat)
        if len(compat_str) > 500:
            errors.append(f"compatibility exceeds 500 characters ({len(compat_str)} chars)")
        else:
            infos.append(f"compatibility: {len(compat_str)} chars ✓")

    # ── 7. 文件引用深度检查 ────────────────────────────────────────────────
    body_start = content.find("---", 3) + 3
    body = content[body_start:]
    links = extract_links(body)

    for link in links:
        if link.startswith(("http://", "https://", "#", "mailto:")):
            continue
        parts = [p for p in link.replace("\\", "/").split("/") if p and p != "."]
        if len(parts) > 2:
            errors.append(f"File reference '{link}' is more than one level deep (found {len(parts)} levels)")
        elif len(parts) == 2:
            infos.append(f"ref ok: {link}")

    # ── 8. 引用文件实际存在性 ──────────────────────────────────────────────
    for link in links:
        if link.startswith(("http://", "https://", "#", "mailto:")):
            continue
        full_path = os.path.join(skill_dir, link)
        if not os.path.exists(full_path):
            warnings.append(f"Referenced file not found: '{link}'")

    # ── 9. 目录结构 ────────────────────────────────────────────────────────
    allowed_dirs = {"references", "assets", "scripts"}
    for entry in sorted(os.listdir(skill_dir)):
        full_path = os.path.join(skill_dir, entry)
        if not os.path.isdir(full_path) or entry.startswith("."):
            continue
        if entry not in allowed_dirs:
            warnings.append(f"Non-standard directory '{entry}/' found (spec defines: references/, assets/, scripts/)")

    # ── 10. 嵌套子目录检查（references/ assets/ 内不应有子目录） ─────────
    for d in ["references", "assets"]:
        d_path = os.path.join(skill_dir, d)
        if not os.path.isdir(d_path):
            continue
        for entry in os.listdir(d_path):
            sub = os.path.join(d_path, entry)
            if os.path.isdir(sub) and not entry.startswith("."):
                errors.append(
                    f"{d}/{entry}/ is a nested subdirectory — spec requires file references to be one level deep; "
                    f"move files directly into {d}/"
                )

    return errors, warnings, infos


def validate_directory(skills_root):
    """Validate all skills in a directory (each subdirectory is a skill)."""
    results = {}
    for entry in sorted(os.listdir(skills_root)):
        full_path = os.path.join(skills_root, entry)
        if not os.path.isdir(full_path) or entry.startswith("."):
            continue
        if os.path.exists(os.path.join(full_path, "SKILL.md")):
            results[entry] = validate_skill(full_path)
    return results


def print_result(name, errors, warnings, infos, verbose=False):
    status = "✅ PASS" if not errors else "❌ FAIL"
    print(f"\n{'─' * 50}")
    print(f"  {status}  {name}")
    print(f"{'─' * 50}")
    for e in errors:
        print(f"  ❌ {e}")
    for w in warnings:
        print(f"  ⚠️  {w}")
    if verbose or not errors:
        for i in infos:
            print(f"  ℹ️  {i}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    target = sys.argv[1]
    verbose = "--verbose" in sys.argv or "-v" in sys.argv

    if not os.path.exists(target):
        print(f"❌ Path not found: {target}")
        sys.exit(1)

    # Batch mode: directory contains multiple skills
    skill_md = os.path.join(target, "SKILL.md")
    if os.path.isdir(target) and not os.path.exists(skill_md):
        results = validate_directory(target)
        if not results:
            print("No SKILL.md found in any subdirectory.")
            sys.exit(1)
        total_errors = 0
        total_warnings = 0
        for skill_name, (errors, warnings, infos) in results.items():
            print_result(skill_name, errors, warnings, infos, verbose)
            total_errors += len(errors)
            total_warnings += len(warnings)
        print(f"\n{'═' * 50}")
        print(f"  Validated {len(results)} skills | ❌ {total_errors} errors | ⚠️  {total_warnings} warnings")
        print(f"{'═' * 50}")
        sys.exit(1 if total_errors > 0 else 0)
    else:
        errors, warnings, infos = validate_skill(target)
        skill_name = os.path.basename(os.path.abspath(target))
        print_result(skill_name, errors, warnings, infos, verbose)
        if errors:
            print(f"\n  Summary: {len(errors)} error(s), {len(warnings)} warning(s)")
            sys.exit(1)
        else:
            print(f"\n  Summary: 0 errors, {len(warnings)} warning(s)")
            sys.exit(0)


if __name__ == "__main__":
    main()
