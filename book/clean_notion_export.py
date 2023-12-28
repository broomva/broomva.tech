#%%
import os
import re
import shutil
import urllib.parse


def remove_uuid(name):
    # Regular expression to match the specific UUID pattern
    uuid_regex = r'[0-9a-f]{32}'
    # Find UUIDs in the name
    match = re.search(uuid_regex, name)
    uuid = match.group(0) if match else None
    # Remove UUIDs from the name
    new_name = re.sub(uuid_regex, '', name).strip()
    # Remove any trailing spaces before the file extension
    new_name = re.sub(r'\s+\.', '.', new_name)
    return new_name, uuid

def rename_files_and_folders(root_path):
    mapping = {}
    removed_uuids = []

    for path, dirs, files in os.walk(root_path, topdown=False):
        # Process files
        for name in files:
            old_file_path = os.path.join(path, name)
            new_name, uuid = remove_uuid(name)
            new_file_path = os.path.join(path, new_name)
            try:
                shutil.move(old_file_path, new_file_path)
                mapping[old_file_path] = new_file_path
                if uuid:
                    removed_uuids.append(uuid)
            except Exception as e:
                print(f"Error processing file {old_file_path}: {e}")

        # Process directories
        for name in dirs:
            old_dir_path = os.path.join(path, name)
            new_name, uuid = remove_uuid(name)
            new_dir_path = os.path.join(path, new_name)
            try:
                shutil.move(old_dir_path, new_dir_path)
                mapping[old_dir_path] = new_dir_path
                if uuid:
                    removed_uuids.append(uuid)
            except Exception as e:
                print(f"Error processing directory {old_dir_path}: {e}")

    return mapping, removed_uuids

def update_file_content(file_path, uuids):
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            content = file.read()

        for uuid in uuids:
            #print(uuid)
            if uuid:
                content = re.sub(rf'%20{uuid}', '', content) # includes the %20 for a space added by notion when including the hash code
                with open(file_path, 'w', encoding='utf-8') as file:
                    print(f"Updating file: {file_path}")
                    file.write(content)
    except Exception as e:
        print(f"Error updating file {file_path}: {e}")


def clean_files_relationships(root_directory, removed_uuids):
    for path, dirs, files in os.walk(root_directory, topdown=False):
            # Process files
            for name in files:
                if name.endswith('.md'):
                    file_path = f'{path}/{name}'
                    update_file_content(file_path, removed_uuids)
#%%
# Use the function
root_directory = "blog"  # Replace with your directory path
mapping, removed_uuids = rename_files_and_folders(root_directory)
clean_files_relationships(root_directory, removed_uuids)

#%%
