use std::collections::{BTreeMap, BTreeSet};
use zellij_tile::prelude::*;

const DEFAULT_LIMITS: &str = "5h: ?% (?) • 7d: ?% (?)";
const DEFAULT_INTERVAL_SECONDS: f64 = 60.0;
const SEGMENT_LEFT: &str = "";
const SEGMENT_RIGHT: &str = "";
const ROSE_BASE: PaletteColor = PaletteColor::Rgb((25, 23, 36));
const ROSE_SURFACE: PaletteColor = PaletteColor::Rgb((38, 35, 58));
const ROSE_HIGHLIGHT: PaletteColor = PaletteColor::Rgb((64, 61, 82));
const ROSE_LOVE: PaletteColor = PaletteColor::Rgb((235, 111, 146));
const ROSE_FOAM: PaletteColor = PaletteColor::Rgb((156, 207, 216));
const ROSE_GOLD: PaletteColor = PaletteColor::Rgb((246, 193, 119));
const ROSE_IRIS: PaletteColor = PaletteColor::Rgb((196, 167, 231));
const ROSE_TEXT: PaletteColor = PaletteColor::Rgb((224, 222, 244));

#[derive(Default)]
struct State {
    session_name: String,
    limits: String,
    limit_segments: Vec<Segment>,
    command: String,
    git_command: String,
    git_status: String,
    active_pane_label: String,
    interval_seconds: f64,
    permissions_granted: bool,
    plugin_id: Option<u32>,
    active_tab_position: Option<usize>,
    border_junction_columns: BTreeSet<usize>,
    focused_border_columns: BTreeSet<usize>,
    focused_border_color: Option<PaletteColor>,
    unfocused_border_color: Option<PaletteColor>,
}

#[derive(Clone)]
struct Segment {
    text: String,
    foreground: PaletteColor,
    background: PaletteColor,
}

register_plugin!(State);

impl State {
    fn refresh_limits(&self) {
        let mut context = BTreeMap::new();
        context.insert("request".to_string(), "codex-limits".to_string());
        run_command(&["/bin/sh", "-lc", self.command.as_str()], context);
    }

    fn refresh_git_status(&self) {
        let mut context = BTreeMap::new();
        context.insert("request".to_string(), "git-branch-status".to_string());
        run_command(&[self.git_command.as_str()], context);
    }

    fn refresh_status(&self) {
        self.refresh_limits();
        self.refresh_git_status();
    }

    fn limit_status_segments(&self) -> Vec<Segment> {
        if self.limit_segments.is_empty() {
            vec![Segment {
                text: self.limits.clone(),
                foreground: ROSE_TEXT,
                background: ROSE_BASE,
            }]
        } else {
            self.limit_segments.clone()
        }
    }

    fn left_status_segments(&self) -> Vec<Segment> {
        let (session_label, session_foreground, session_background) =
            if let Some(slug) = self.session_name.strip_prefix("gertrude__") {
                (format!("gt: {}", slug), ROSE_BASE, ROSE_LOVE)
            } else {
                (self.session_name.clone(), ROSE_FOAM, ROSE_HIGHLIGHT)
            };

        let mut segments = vec![Segment {
            text: session_label,
            foreground: session_foreground,
            background: session_background,
        }];

        if !self.active_pane_label.is_empty() {
            segments.push(Segment {
                text: self.active_pane_label.clone(),
                foreground: ROSE_FOAM,
                background: ROSE_SURFACE,
            });
        }

        segments
    }

    fn center_status_segments(&self) -> Vec<Segment> {
        if self.git_status.is_empty() {
            return Vec::new();
        }

        vec![Segment {
            text: format!(" {}", self.git_status),
            foreground: if self.git_status.ends_with('*') {
                ROSE_GOLD
            } else {
                ROSE_IRIS
            },
            background: ROSE_BASE,
        }]
    }

    fn update_border_junctions(&mut self, pane_manifest: &PaneManifest) {
        let Some(plugin_id) = self.plugin_id else {
            return;
        };

        let tab_positions = self
            .active_tab_position
            .map(|position| vec![position])
            .unwrap_or_else(|| pane_manifest.panes.keys().copied().collect());

        for tab_position in tab_positions {
            let Some(panes) = pane_manifest.panes.get(&tab_position) else {
                continue;
            };
            let Some(status_pane) = panes
                .iter()
                .find(|pane| pane.is_plugin && pane.id == plugin_id)
            else {
                continue;
            };

            let status_top = status_pane.pane_y;
            let status_left = status_pane.pane_content_x;
            let status_right = status_left.saturating_add(status_pane.pane_content_columns);
            let mut junction_candidates = BTreeMap::new();
            let mut focused_border_columns = BTreeSet::new();
            let mut active_pane_label = String::new();

            for pane in panes {
                let is_status_plugin = pane.is_plugin && pane.id == plugin_id;
                if pane.is_floating || pane.is_suppressed || is_status_plugin {
                    continue;
                }

                if pane.is_focused {
                    active_pane_label = pane_label(pane);
                }

                let pane_bottom = pane.pane_y.saturating_add(pane.pane_rows);
                let pane_content_bottom =
                    pane.pane_content_y.saturating_add(pane.pane_content_rows);
                if pane_bottom != status_top && pane_content_bottom != status_top {
                    continue;
                }

                if pane.is_focused {
                    let start = pane.pane_x.max(status_left);
                    let end = pane
                        .pane_x
                        .saturating_add(pane.pane_columns)
                        .min(status_right);
                    for global_column in start..end {
                        focused_border_columns.insert(global_column - status_left);
                    }
                }

                for global_column in [
                    pane.pane_x,
                    pane.pane_x
                        .saturating_add(pane.pane_columns)
                        .saturating_sub(1),
                ] {
                    if global_column >= status_left && global_column < status_right {
                        let local_column = global_column - status_left;
                        junction_candidates
                            .entry(local_column)
                            .and_modify(|focused| *focused = *focused || pane.is_focused)
                            .or_insert(pane.is_focused);
                    }
                }
            }

            let (junction_columns, focused_junction_columns) =
                collapse_adjacent_junction_columns(junction_candidates);
            focused_border_columns.extend(focused_junction_columns);
            self.border_junction_columns = junction_columns;
            self.focused_border_columns = focused_border_columns;
            self.active_pane_label = active_pane_label;
            return;
        }
    }
}

impl ZellijPlugin for State {
    fn load(&mut self, configuration: BTreeMap<String, String>) {
        self.session_name = "zellij".to_string();
        self.limits = DEFAULT_LIMITS.to_string();
        self.command = configuration
            .get("command")
            .cloned()
            .unwrap_or_else(|| "codex-limits".to_string());
        self.git_command = configuration
            .get("git_command")
            .cloned()
            .unwrap_or_else(|| "git-branch-status".to_string());
        self.interval_seconds = configuration
            .get("interval_seconds")
            .and_then(|value| value.parse::<f64>().ok())
            .filter(|value| *value >= 5.0)
            .unwrap_or(DEFAULT_INTERVAL_SECONDS);
        self.permissions_granted = true;
        self.plugin_id = Some(get_plugin_ids().plugin_id);

        subscribe(&[
            EventType::ModeUpdate,
            EventType::PaneUpdate,
            EventType::PermissionRequestResult,
            EventType::RunCommandResult,
            EventType::TabUpdate,
            EventType::Timer,
        ]);
        request_permission(&[
            PermissionType::ReadApplicationState,
            PermissionType::RunCommands,
        ]);
        set_timeout(0.1);
    }

    fn update(&mut self, event: Event) -> bool {
        match event {
            Event::ModeUpdate(mode_info) => {
                self.session_name = mode_info
                    .session_name
                    .unwrap_or_else(|| "zellij".to_string());
                self.focused_border_color = Some(mode_info.style.colors.frame_selected.base);
                self.unfocused_border_color = mode_info
                    .style
                    .colors
                    .frame_unselected
                    .map(|style| style.base);
                true
            }
            Event::TabUpdate(tabs) => {
                self.active_tab_position =
                    tabs.iter().find(|tab| tab.active).map(|tab| tab.position);
                true
            }
            Event::PaneUpdate(pane_manifest) => {
                self.update_border_junctions(&pane_manifest);
                true
            }
            Event::PermissionRequestResult(PermissionStatus::Granted) => {
                self.permissions_granted = true;
                set_selectable(false);
                self.refresh_status();
                set_timeout(self.interval_seconds);
                true
            }
            Event::PermissionRequestResult(PermissionStatus::Denied) => {
                self.permissions_granted = false;
                self.limits = "permission denied".to_string();
                true
            }
            Event::RunCommandResult(exit_code, stdout, _stderr, context) => {
                match context.get("request").map(String::as_str) {
                    Some("codex-limits") => {
                        let output = if exit_code == Some(0) {
                            String::from_utf8_lossy(&stdout).trim().to_string()
                        } else {
                            DEFAULT_LIMITS.to_string()
                        };

                        if output.is_empty() {
                            self.limits = DEFAULT_LIMITS.to_string();
                            self.limit_segments.clear();
                        } else {
                            self.limits = output.clone();
                            self.limit_segments = parse_limit_segments(&output);
                        }

                        true
                    }
                    Some("git-branch-status") => {
                        self.git_status = if exit_code == Some(0) {
                            compact(&String::from_utf8_lossy(&stdout))
                        } else {
                            String::new()
                        };
                        true
                    }
                    _ => false,
                }
            }
            Event::Timer(_) => {
                if self.permissions_granted {
                    self.refresh_status();
                }
                set_timeout(self.interval_seconds);
                true
            }
            _ => false,
        }
    }

    fn render(&mut self, rows: usize, cols: usize) {
        let status = three_section_segment_line(
            &self.left_status_segments(),
            &self.center_status_segments(),
            &self.limit_status_segments(),
            cols,
        );
        if rows >= 2 {
            print!(
                "{}\n{}",
                top_border(
                    cols,
                    &self.border_junction_columns,
                    &self.focused_border_columns,
                    self.focused_border_color,
                    self.unfocused_border_color,
                ),
                status
            );
        } else {
            print!("{}", status);
        }
    }
}

fn collapse_adjacent_junction_columns(
    candidates: BTreeMap<usize, bool>,
) -> (BTreeSet<usize>, BTreeSet<usize>) {
    let mut collapsed = BTreeSet::new();
    let mut focused = BTreeSet::new();
    let mut group_start = None;
    let mut group_previous = None;
    let mut group_focused = false;

    for (column, column_focused) in candidates {
        if group_previous == Some(column.saturating_sub(1)) {
            group_previous = Some(column);
            group_focused = group_focused || column_focused;
            continue;
        }

        if let Some(start) = group_start {
            collapsed.insert(start);
            if group_focused {
                focused.insert(start);
            }
        }

        group_start = Some(column);
        group_previous = Some(column);
        group_focused = column_focused;
    }

    if let Some(start) = group_start {
        collapsed.insert(start);
        if group_focused {
            focused.insert(start);
        }
    }

    (collapsed, focused)
}

fn pane_label(pane: &PaneInfo) -> String {
    let command = pane
        .terminal_command
        .as_deref()
        .map(command_label)
        .unwrap_or_default();
    if !command.is_empty() {
        return command;
    }

    let title = compact(&pane.title);
    if !title.is_empty() && title != "No Name" {
        return title;
    }

    String::new()
}

fn command_label(command: &str) -> String {
    let first_word = command.split_whitespace().next().unwrap_or(command);
    let basename = first_word.rsplit('/').next().unwrap_or(first_word);
    compact(basename)
}

fn top_border(
    width: usize,
    junction_columns: &BTreeSet<usize>,
    focused_columns: &BTreeSet<usize>,
    focused_color: Option<PaletteColor>,
    unfocused_color: Option<PaletteColor>,
) -> String {
    let mut output = String::new();
    let mut current_focused = None;

    for column in 0..width {
        let focused = focused_columns.contains(&column);
        if current_focused != Some(focused) {
            output.push_str(&foreground_sequence(if focused {
                focused_color
            } else {
                unfocused_color
            }));
            current_focused = Some(focused);
        }

        output.push(
            if column > 0 && column < width - 1 && junction_columns.contains(&column) {
                '┴'
            } else {
                '─'
            },
        );
    }

    output.push_str(reset_color_sequence());
    output
}

fn foreground_sequence(color: Option<PaletteColor>) -> String {
    match color {
        Some(PaletteColor::Rgb((red, green, blue))) => {
            format!("\u{1b}[38;2;{red};{green};{blue}m")
        }
        Some(PaletteColor::EightBit(color)) => format!("\u{1b}[38;5;{color}m"),
        None => "\u{1b}[39m".to_string(),
    }
}

fn background_sequence(color: Option<PaletteColor>) -> String {
    match color {
        Some(PaletteColor::Rgb((red, green, blue))) => {
            format!("\u{1b}[48;2;{red};{green};{blue}m")
        }
        Some(PaletteColor::EightBit(color)) => format!("\u{1b}[48;5;{color}m"),
        None => "\u{1b}[49m".to_string(),
    }
}

fn reset_color_sequence() -> &'static str {
    "\u{1b}[39;49m"
}

fn three_section_segment_line(
    left: &[Segment],
    center: &[Segment],
    right: &[Segment],
    width: usize,
) -> String {
    if width == 0 {
        return String::new();
    }

    let mut fitted_left = left.to_vec();
    let mut fitted_center = center.to_vec();
    let mut fitted_right = right.to_vec();

    while sections_width(&fitted_left, &fitted_center, &fitted_right) > width {
        if !shrink_widest_segment(&mut fitted_left)
            && !shrink_widest_segment(&mut fitted_center)
            && !shrink_widest_segment(&mut fitted_right)
        {
            break;
        }
    }

    let left_width = segments_width(&fitted_left);
    let center_width = segments_width(&fitted_center);
    let right_width = segments_width(&fitted_right);

    if center_width == 0 {
        let padding = width.saturating_sub(left_width + right_width).max(1);
        return format!(
            "{}{}{}",
            render_segments(&fitted_left),
            " ".repeat(padding),
            render_segments(&fitted_right)
        );
    }

    let target_center_start = width.saturating_sub(center_width) / 2;
    let minimum_center_start = if left_width > 0 { left_width + 1 } else { 0 };
    let maximum_center_start = if right_width > 0 {
        width.saturating_sub(right_width + center_width + 1)
    } else {
        width.saturating_sub(center_width)
    };
    let center_start = if minimum_center_start <= maximum_center_start {
        target_center_start.clamp(minimum_center_start, maximum_center_start)
    } else {
        minimum_center_start.min(width.saturating_sub(center_width))
    };

    let left_padding = center_start.saturating_sub(left_width);
    let right_padding =
        width.saturating_sub(left_width + left_padding + center_width + right_width);

    format!(
        "{}{}{}{}{}",
        render_segments(&fitted_left),
        " ".repeat(left_padding),
        render_segments(&fitted_center),
        " ".repeat(right_padding),
        render_segments(&fitted_right)
    )
}

fn sections_width(left: &[Segment], center: &[Segment], right: &[Segment]) -> usize {
    let left_width = segments_width(left);
    let center_width = segments_width(center);
    let right_width = segments_width(right);
    left_width
        + center_width
        + right_width
        + section_gap_count(left_width, center_width, right_width)
}

fn section_gap_count(left_width: usize, center_width: usize, right_width: usize) -> usize {
    if center_width == 0 {
        usize::from(left_width > 0 && right_width > 0)
    } else {
        usize::from(left_width > 0) + usize::from(right_width > 0)
    }
}

fn shrink_widest_segment(segments: &mut Vec<Segment>) -> bool {
    segments.retain(|segment| !segment.text.is_empty());

    if segments.is_empty() {
        return false;
    }

    let widest_index = (0..segments.len())
        .max_by_key(|index| display_width(&segments[*index].text))
        .unwrap_or(0);
    let widest_text_width = display_width(&segments[widest_index].text);

    if widest_text_width <= 1 {
        segments.remove(widest_index);
    } else {
        segments[widest_index].text = truncate(&segments[widest_index].text, widest_text_width - 1);
    }

    true
}

fn parse_limit_segments(output: &str) -> Vec<Segment> {
    let fields = output.split('\t').collect::<Vec<_>>();
    if fields.len() == 6 {
        return vec![
            limit_segment(fields[0], fields[1], fields[2], ROSE_FOAM, ROSE_SURFACE),
            limit_segment(fields[3], fields[4], fields[5], ROSE_FOAM, ROSE_SURFACE),
        ];
    }

    let parts = output.split(" • ").collect::<Vec<_>>();
    if parts.len() == 2 {
        return [
            parse_human_limit_segment(parts[0], ROSE_FOAM, ROSE_SURFACE),
            parse_human_limit_segment(parts[1], ROSE_FOAM, ROSE_SURFACE),
        ]
        .into_iter()
        .flatten()
        .collect();
    }

    Vec::new()
}

fn parse_human_limit_segment(
    part: &str,
    accent: PaletteColor,
    background: PaletteColor,
) -> Option<Segment> {
    let (label, rest) = part.split_once(':')?;
    let rest = rest.trim();
    let reset_start = rest.find('(')?;
    let reset_end = rest.rfind(')')?;
    let percent = rest[..reset_start].trim();
    let reset = rest[reset_start + 1..reset_end].trim();
    Some(limit_segment(label, percent, reset, accent, background))
}

fn limit_segment(
    label: &str,
    percent: &str,
    reset: &str,
    accent: PaletteColor,
    background: PaletteColor,
) -> Segment {
    Segment {
        text: format!(
            "{}: {} ({})",
            compact(label),
            compact(percent),
            compact(reset)
        ),
        foreground: accent,
        background,
    }
}

fn segments_width(segments: &[Segment]) -> usize {
    if segments.is_empty() {
        return 0;
    }

    segments.iter().map(segment_width).sum::<usize>() + segments.len() - 1
}

fn segment_width(segment: &Segment) -> usize {
    display_width(SEGMENT_LEFT) + display_width(&segment.text) + 2 + display_width(SEGMENT_RIGHT)
}

fn render_segments(segments: &[Segment]) -> String {
    segments
        .iter()
        .map(render_segment)
        .collect::<Vec<_>>()
        .join(" ")
}

fn render_segment(segment: &Segment) -> String {
    let mut output = String::new();

    output.push_str(&foreground_sequence(Some(segment.background)));
    output.push_str(&background_sequence(None));
    output.push_str(SEGMENT_LEFT);

    output.push_str(&foreground_sequence(Some(segment.foreground)));
    output.push_str(&background_sequence(Some(segment.background)));
    output.push(' ');
    output.push_str(&segment.text);
    output.push(' ');

    output.push_str(&foreground_sequence(Some(segment.background)));
    output.push_str(&background_sequence(None));
    output.push_str(SEGMENT_RIGHT);
    output.push_str(reset_color_sequence());

    output
}

fn compact(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn display_width(value: &str) -> usize {
    value.chars().count()
}

fn truncate(value: &str, max_width: usize) -> String {
    let width = display_width(value);
    if width <= max_width {
        return value.to_string();
    }

    if max_width == 0 {
        return String::new();
    }

    if max_width <= 1 {
        return "…".to_string();
    }

    let mut output = value.chars().take(max_width - 1).collect::<String>();
    output.push('…');
    output
}
