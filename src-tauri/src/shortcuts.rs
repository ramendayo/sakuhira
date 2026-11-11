pub(crate) fn normalize_shortcut(shortcut: &str) -> Result<String, String> {
    let parts: Vec<_> = shortcut.split('+').map(str::trim).collect();
    if parts.len() < 2 || parts.iter().any(|part| part.is_empty()) {
        return Err("ショートカットの形式が不正です。".into());
    }

    let mut command = false;
    let mut control = false;
    let mut alt = false;
    let mut shift = false;
    for modifier in &parts[..parts.len() - 1] {
        let slot = match modifier.to_ascii_lowercase().as_str() {
            "command" | "cmd" | "super" | "meta" => &mut command,
            "control" | "ctrl" => &mut control,
            "alt" | "option" => &mut alt,
            "shift" => &mut shift,
            _ => return Err("修飾キーが不正です。".into()),
        };
        if *slot {
            return Err("修飾キーを重複して指定できません。".into());
        }
        *slot = true;
    }
    if !command && !control && !alt {
        return Err("Command、Control、Altのいずれかが必要です。".into());
    }

    let key = parts[parts.len() - 1].to_ascii_uppercase();
    let normalized_key = if let Some(letter) = key
        .strip_prefix("KEY")
        .filter(|letter| letter.len() == 1 && letter.as_bytes()[0].is_ascii_alphabetic())
    {
        format!("Key{}", letter.to_ascii_uppercase())
    } else if let Some(digit) = key
        .strip_prefix("DIGIT")
        .filter(|digit| digit.len() == 1 && digit.as_bytes()[0].is_ascii_digit())
    {
        format!("Digit{digit}")
    } else if key.len() == 1 && key.as_bytes()[0].is_ascii_alphabetic() {
        format!("Key{}", key.to_ascii_uppercase())
    } else if key.len() == 1 && key.as_bytes()[0].is_ascii_digit() {
        format!("Digit{key}")
    } else if let Some(number) = key.strip_prefix('F').or_else(|| key.strip_prefix('f')) {
        match number.parse::<u8>() {
            Ok(parsed @ 1..=12) if parsed.to_string() == number => format!("F{parsed}"),
            _ => return Err("主キーが不正です。".into()),
        }
    } else {
        return Err("主キーが不正です。".into());
    };

    if command && !control && !alt && !shift && matches!(normalized_key.as_str(), "KeyQ" | "KeyW") {
        return Err("Command+QとCommand+Wは予約されています。".into());
    }

    let mut normalized = Vec::new();
    if command {
        normalized.push("Command");
    }
    if control {
        normalized.push("Control");
    }
    if alt {
        normalized.push("Alt");
    }
    if shift {
        normalized.push("Shift");
    }
    normalized.push(&normalized_key);
    Ok(normalized.join("+"))
}

#[cfg(test)]
mod tests {
    use super::normalize_shortcut;

    #[test]
    fn normalizes_aliases_case_and_modifier_order() {
        assert_eq!(
            normalize_shortcut(" shift + option + ctrl + cmd + a ").unwrap(),
            "Command+Control+Alt+Shift+KeyA"
        );
        assert_eq!(normalize_shortcut("alt+f12").unwrap(), "Alt+F12");
        assert_eq!(normalize_shortcut("ctrl+7").unwrap(), "Control+Digit7");
        assert_eq!(normalize_shortcut("ctrl+keya").unwrap(), "Control+KeyA");
        for normalized in [
            "Command+Control+Alt+Shift+KeyA",
            "Alt+F12",
            "Control+Digit7",
        ] {
            assert_eq!(normalize_shortcut(normalized).unwrap(), normalized);
        }
    }

    #[test]
    fn rejects_invalid_and_reserved_shortcuts() {
        for value in [
            "Shift+A",
            "Control+Ctrl+A",
            "Ctrl++A",
            "Ctrl+A+Shift",
            "Cmd+Q",
            "Meta+W",
            "Ctrl+F13",
            "Ctrl+é",
        ] {
            assert!(normalize_shortcut(value).is_err(), "{value}");
        }
        assert_eq!(
            normalize_shortcut("Ctrl+Cmd+Q").unwrap(),
            "Command+Control+KeyQ"
        );
    }
}
