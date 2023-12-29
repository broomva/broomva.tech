#%%

import os
import re


def find_markdown_files(root_dir):
    """
    Traverse the directory tree and find all Markdown files.
    """
    md_files = {}
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith('.md'):
                full_path = os.path.join(root, file)
                relative_path = os.path.relpath(full_path, root_dir)
                md_files[relative_path] = full_path
    return md_files

def validate_link(link, current_dir, md_files):
    """
    Check if the Markdown link is valid.
    """
    if link.startswith('http://') or link.startswith('https://'):
        return True  # Assuming external links are valid
    else:
        # Construct the full path for internal links
        full_path = os.path.normpath(os.path.join(current_dir, link))
        return full_path in md_files.values()

import difflib


def find_closest_match(invalid_link, md_files):
    """
    Find the closest match for an invalid link from the list of valid Markdown files.
    """
    # Extract just the filename part of the link
    invalid_filename = os.path.basename(invalid_link)
    valid_filenames = [os.path.basename(path) for path in md_files.keys()]
    
    closest_match = difflib.get_close_matches(invalid_filename, valid_filenames, n=1)
    if closest_match:
        return closest_match[0]
    else:
        return None
    
import os
import re

# def to_snake_case(name):
#     """
#     Convert a string to snake_case.
#     """
#     s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
#     return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower().replace(' ', '')


def to_snake_case(filename):
    # Split the filename and extension
    name, extension = os.path.splitext(filename)

    # Normalize the name: lowercasing
    name = name.lower()

    # Handle special characters: remove non-alphanumeric characters except spaces
    name = re.sub(r'[^\w\s]', '', name)

    # Handle spaces and delimiters: replace spaces with underscores
    name = re.sub(r'\s+', '_', name)

    # Recombine the name with the extension
    return name + extension

def rename_files_and_folders(root_dir):
    """
    Rename all files and folders under the root directory to snake_case.
    """
    for root, dirs, files in os.walk(root_dir, topdown=False):
        # Rename files
        for name in files:
            snake_case_name = to_snake_case(name)
            if name != snake_case_name:
                os.rename(os.path.join(root, name), os.path.join(root, snake_case_name))

        # Rename directories
        for name in dirs:
            snake_case_name = to_snake_case(name)
            if name != snake_case_name:
                os.rename(os.path.join(root, name), os.path.join(root, snake_case_name))

def update_markdown_links(file_path, old_new_map):
    """
    Update the links in the Markdown file based on the provided mapping.
    """
    link_pattern = re.compile(r'\[.*?\]\((.*?)\)')
    modified = False

    with open(file_path, 'r') as file:
        content = file.read()

    for old_path, new_path in old_new_map.items():
        if old_path in content:
            content = content.replace(old_path, new_path)
            modified = True

    if modified:
        with open(file_path, 'w') as file:
            file.write(content)


def update_markdown_file_2(file_path, md_files, root_dir):
    """
    Update the Markdown file by checking its links and potentially adding TOC.
    """
    link_pattern = re.compile(r'\[.*?\]\((.*?)\)')
    modified = False
    current_dir = os.path.dirname(file_path)

    with open(file_path, 'r') as file:
        lines = file.readlines()

    new_lines = []
    for line in lines:
        new_line = line
        for link in link_pattern.findall(line):
            print(f"Invalid link found in {file_path}: {link}")
            closest_match = find_closest_match(link, md_files)
            if closest_match:
                new_link = os.path.join(os.path.dirname(link), closest_match)
                new_line = line.replace(link, new_link)
                print(f"Link updated: {link} -> {new_link}")
                modified = True
        new_lines.append(new_line)

    if modified:
        with open(file_path, 'w') as file:
            file.writelines(new_lines)

#%%
root_dir = './tech_scribbles'

# First, create a map of old paths to new snake_case paths
old_new_map = {}
for root, dirs, files in os.walk(root_dir, topdown=False):
    for name in files + dirs:
        snake_case_name = to_snake_case(name)
        if name != snake_case_name:
            old_path = os.path.join(root, name)
            new_path = os.path.join(root, snake_case_name)
            old_new_map[old_path] = new_path

# Rename files and folders
rename_files_and_folders(root_dir)

#%%

# Update Markdown links
md_files = find_markdown_files(root_dir)
for _, full_path in md_files.items():
    update_markdown_links(full_path, old_new_map)



# #%%            
md_files = find_markdown_files(root_dir)

for relative_path, full_path in md_files.items():
    update_markdown_file_2(full_path, md_files, root_dir)

# %%


import os


def generate_gitbook_summary(root_dir, output_file='SUMMARY.md'):
    summary_lines = ['# Summary\n\n']


    for root, dirs, files in sorted(os.walk(root_dir)):
        # Skip the root directory itself
        if root == root_dir:
            continue

        # Sort directories and files
        dirs.sort()
        files.sort()

        # Calculate the depth for header levels
        depth = root[len(root_dir):].count(os.sep)
        header_level = '#' * (depth + 2)  # Starting from '##' for the first level

        # Folder title (use the name of the folder)
        folder_name = os.path.basename(root)
        folder_path = os.path.relpath(root, root_dir)
        # if depth > 0:
        #     summary_lines.append(f'{header_level} [{folder_name}]({folder_path}/{folder_name}.md)\n\n')

        # Files under the folder
        for file in files:
            if file.endswith('.md') and file != f'{folder_name}.md':
                file_path = os.path.relpath(os.path.join(root, file), root_dir)
                file_title = os.path.splitext(file)[0]
                summary_lines.append(f'{header_level}   * [{file_title}]({file_path})\n')

    # Write to SUMMARY.md file
    with open(output_file, 'w') as file:
        file.writelines(summary_lines)

# Use the function with your project's root directory
generate_gitbook_summary('.')

# %%


import os


def format_summary_line(title, path, depth):
    header_level = '#' * (depth + 1)
    return f'{header_level} [{title}]({path})\n'

def generate_summary_line(file_path, root_dir, depth):
    relative_path = os.path.relpath(file_path, root_dir)
    title = os.path.splitext(os.path.basename(file_path))[0]
    return format_summary_line(title, relative_path, depth)

def generate_gitbook_summary(root_dir, output_file='SUMMARY.md'):
    summary_lines = ['# Summary\n\n']
    for root, dirs, files in os.walk(root_dir):
        depth = root[len(root_dir):].count(os.sep)
        if root == root_dir:
            depth -= 1  # Adjust depth for root directory

        dirs.sort()
        files.sort()

        # Folder as a section
        if root != root_dir:
            folder_title = os.path.basename(root)
            folder_rel_path = os.path.relpath(root, root_dir)
            summary_lines.append(format_summary_line(folder_title, os.path.join(folder_rel_path, folder_title + '.md'), depth))

        # Files as subsections
        for file in files:
            if file.endswith('.md'):
                file_path = os.path.join(root, file)
                summary_lines.append(generate_summary_line(file_path, root_dir, depth + 1))

    # Write to SUMMARY.md file
    with open(output_file, 'w') as file:
        file.writelines(summary_lines)

# Use the function with your project's root directory
generate_gitbook_summary('/path/to/your/markdown/project')
